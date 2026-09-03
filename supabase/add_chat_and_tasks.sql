-- =============================================
-- TNN Platform - Chat, Task Subtasks, Role Cleanup
-- Run this entire file in your Supabase SQL editor
-- (after schema.sql and add_features.sql / add_slack_user_id.sql)
-- =============================================

-- =============================================
-- 1. TASKS: subtasks + exec-only visibility
-- =============================================
alter table public.tasks
  add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;

alter table public.tasks
  add column if not exists exec_only boolean not null default false;

drop policy if exists "Tasks viewable by authenticated users" on public.tasks;
drop policy if exists "Tasks viewable respecting exec_only" on public.tasks;
create policy "Tasks viewable respecting exec_only"
  on public.tasks for select
  using (
    not exec_only
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );


-- =============================================
-- 2. SEGMENT ROLES: merge VFX roles, drop Researcher, add Script Editor
-- =============================================
-- Multiple people can now share a role slot (e.g. several VFX people on one segment)
drop index if exists public.segment_roles_unique_permanent;

update public.segment_roles
  set role_type = 'VFX'
  where role_type in ('Thumbnail Designer', 'Motion Graphics', 'Audio Engineer');

delete from public.segment_roles where role_type = 'Researcher';


-- =============================================
-- 3. CHAT SYSTEM
-- =============================================

create or replace function public.is_exec(uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and role in ('exec', 'admin')
  );
$$;

-- Channels: DMs, regular channels, and read-only announcement channels.
-- A channel can optionally be linked to a segment (auto-created per segment).
create table if not exists public.channels (
  id           uuid default gen_random_uuid() primary key,
  type         text not null default 'channel' check (type in ('dm', 'channel', 'announcement')),
  name         text,
  segment_id   uuid references public.segments(id) on delete set null,
  read_only    boolean not null default false,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now()
);
alter table public.channels enable row level security;

create table if not exists public.channel_members (
  id           uuid default gen_random_uuid() primary key,
  channel_id   uuid references public.channels(id) on delete cascade not null,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  created_at   timestamptz default now(),
  unique(channel_id, user_id)
);
alter table public.channel_members enable row level security;

-- security definer so channel_members' own RLS policies can check membership
-- without querying channel_members from inside its own policy (which Postgres
-- rejects with "infinite recursion detected in policy").
create or replace function public.is_channel_member(cid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.channel_members where channel_id = cid and user_id = uid
  );
$$;

drop policy if exists "Channels viewable by members or execs" on public.channels;
create policy "Channels viewable by members or execs"
  on public.channels for select
  using (
    public.is_exec(auth.uid())
    or public.is_channel_member(channels.id, auth.uid())
  );

drop policy if exists "Execs create channels, anyone can start a DM" on public.channels;
create policy "Execs create channels, anyone can start a DM"
  on public.channels for insert
  with check (type = 'dm' or public.is_exec(auth.uid()));

drop policy if exists "Execs can update channels" on public.channels;
create policy "Execs can update channels"
  on public.channels for update
  using (public.is_exec(auth.uid()));

drop policy if exists "Execs can delete channels" on public.channels;
create policy "Execs can delete channels"
  on public.channels for delete
  using (public.is_exec(auth.uid()));

drop policy if exists "Channel members viewable by members or execs" on public.channel_members;
create policy "Channel members viewable by members or execs"
  on public.channel_members for select
  using (
    public.is_exec(auth.uid())
    or public.is_channel_member(channel_members.channel_id, auth.uid())
  );

drop policy if exists "Members can add people to channels they're in" on public.channel_members;
create policy "Members can add people to channels they're in"
  on public.channel_members for insert
  with check (
    public.is_exec(auth.uid())
    or public.is_channel_member(channel_members.channel_id, auth.uid())
  );

drop policy if exists "Execs or self can remove membership" on public.channel_members;
create policy "Execs or self can remove membership"
  on public.channel_members for delete
  using (public.is_exec(auth.uid()) or user_id = auth.uid());


-- Manually-linked groups of channels (e.g. multiple channels tied to one segment effort).
create table if not exists public.channel_groups (
  id           uuid default gen_random_uuid() primary key,
  name         text not null,
  segment_id   uuid references public.segments(id) on delete set null,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now()
);
alter table public.channel_groups enable row level security;

drop policy if exists "Channel groups viewable by authenticated users" on public.channel_groups;
create policy "Channel groups viewable by authenticated users"
  on public.channel_groups for select
  using (auth.role() = 'authenticated');

drop policy if exists "Execs manage channel groups" on public.channel_groups;
create policy "Execs manage channel groups"
  on public.channel_groups for all
  using (public.is_exec(auth.uid()));

create table if not exists public.channel_group_members (
  group_id     uuid references public.channel_groups(id) on delete cascade not null,
  channel_id   uuid references public.channels(id) on delete cascade not null,
  primary key (group_id, channel_id)
);
alter table public.channel_group_members enable row level security;

drop policy if exists "Channel group members viewable by authenticated users" on public.channel_group_members;
create policy "Channel group members viewable by authenticated users"
  on public.channel_group_members for select
  using (auth.role() = 'authenticated');

drop policy if exists "Execs manage channel group members" on public.channel_group_members;
create policy "Execs manage channel group members"
  on public.channel_group_members for all
  using (public.is_exec(auth.uid()));


create table if not exists public.messages (
  id                     uuid default gen_random_uuid() primary key,
  channel_id             uuid references public.channels(id) on delete cascade not null,
  sender_id              uuid references public.profiles(id),
  body                   text not null,
  mentioned_user_ids     uuid[] default '{}',
  mentioned_segment_ids  uuid[] default '{}',
  mentioned_task_ids     uuid[] default '{}',
  created_at             timestamptz default now()
);
alter table public.messages enable row level security;

drop policy if exists "Messages viewable by channel members or execs" on public.messages;
create policy "Messages viewable by channel members or execs"
  on public.messages for select
  using (
    public.is_exec(auth.uid())
    or public.is_channel_member(messages.channel_id, auth.uid())
  );

drop policy if exists "Members can post unless channel is read-only for them" on public.messages;
create policy "Members can post unless channel is read-only for them"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_channel_member(messages.channel_id, auth.uid())
    and (
      public.is_exec(auth.uid())
      or not exists (
        select 1 from public.channels c
        where c.id = messages.channel_id and c.read_only
      )
    )
  );

drop policy if exists "Senders or execs can delete messages" on public.messages;
create policy "Senders or execs can delete messages"
  on public.messages for delete
  using (sender_id = auth.uid() or public.is_exec(auth.uid()));

do $$
begin
  execute 'alter publication supabase_realtime add table public.messages';
exception when others then
  null; -- already added
end $$;


-- Auto-create a channel whenever a segment is created.
create or replace function public.handle_segment_channel()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.channels (type, name, segment_id, created_by)
  values ('channel', new.title, new.id, new.created_by);
  return new;
end;
$$;

drop trigger if exists segments_create_channel on public.segments;
create trigger segments_create_channel
  after insert on public.segments
  for each row execute function public.handle_segment_channel();

-- Add a person to the segment's channel whenever they're assigned a role.
create or replace function public.handle_segment_role_channel_member()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  ch_id uuid;
begin
  select id into ch_id from public.channels
    where segment_id = new.segment_id and type = 'channel' limit 1;

  if ch_id is null then
    insert into public.channels (type, name, segment_id, created_by)
    values ('channel', (select title from public.segments where id = new.segment_id), new.segment_id, new.user_id)
    returning id into ch_id;
  end if;

  insert into public.channel_members (channel_id, user_id)
  values (ch_id, new.user_id)
  on conflict (channel_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists segment_roles_add_channel_member on public.segment_roles;
create trigger segment_roles_add_channel_member
  after insert on public.segment_roles
  for each row execute function public.handle_segment_role_channel_member();

-- Remove a person from the segment's channel once they have no roles left on it.
create or replace function public.handle_segment_role_channel_member_remove()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  ch_id uuid;
begin
  select id into ch_id from public.channels
    where segment_id = old.segment_id and type = 'channel' limit 1;

  if ch_id is not null and not exists (
    select 1 from public.segment_roles
    where segment_id = old.segment_id and user_id = old.user_id
  ) then
    delete from public.channel_members where channel_id = ch_id and user_id = old.user_id;
  end if;

  return old;
end;
$$;

drop trigger if exists segment_roles_remove_channel_member on public.segment_roles;
create trigger segment_roles_remove_channel_member
  after delete on public.segment_roles
  for each row execute function public.handle_segment_role_channel_member_remove();

-- Backfill: create a channel for every existing segment that doesn't have one yet,
-- and add everyone who already has a role on that segment.
insert into public.channels (type, name, segment_id, created_by)
select 'channel', s.title, s.id, s.created_by
from public.segments s
where not exists (select 1 from public.channels c where c.segment_id = s.id);

insert into public.channel_members (channel_id, user_id)
select c.id, sr.user_id
from public.segment_roles sr
join public.channels c on c.segment_id = sr.segment_id and c.type = 'channel'
on conflict (channel_id, user_id) do nothing;

-- =============================================
-- DONE!
-- =============================================
