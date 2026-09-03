-- =============================================
-- TNN Platform - In-app notifications
-- Run after add_chat_and_tasks.sql and add_message_mentions_and_email.sql
-- =============================================

create table if not exists public.notifications (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  type        text not null,
  title       text not null,
  body        text,
  link_url    text,
  read        boolean not null default false,
  created_at  timestamptz default now()
);
alter table public.notifications enable row level security;

drop policy if exists "Users see their own notifications" on public.notifications;
create policy "Users see their own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
  on public.notifications for delete
  using (user_id = auth.uid());

do $$
begin
  execute 'alter publication supabase_realtime add table public.notifications';
exception when others then
  null; -- already added
end $$;


-- Chat: notify DM recipients on every message, and @mentioned people in
-- channels/announcements (mentioned_user_ids already includes @everyone's
-- expansion, done client-side at send time).
create or replace function public.notify_message_recipients()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  ch public.channels%rowtype;
  sender_name text;
  preview text;
  recipient uuid;
begin
  select * into ch from public.channels where id = new.channel_id;
  select full_name into sender_name from public.profiles where id = new.sender_id;
  preview := left(new.body, 140);

  if ch.type = 'dm' then
    for recipient in
      select cm.user_id from public.channel_members cm
      where cm.channel_id = new.channel_id and cm.user_id <> new.sender_id
    loop
      insert into public.notifications (user_id, type, title, body, link_url)
      values (recipient, 'message', coalesce(sender_name, 'Someone') || ' sent you a message', preview, '/chat');
    end loop;
  else
    foreach recipient in array coalesce(new.mentioned_user_ids, '{}'::uuid[])
    loop
      if recipient <> new.sender_id then
        insert into public.notifications (user_id, type, title, body, link_url)
        values (
          recipient, 'mention',
          coalesce(sender_name, 'Someone') || ' mentioned you in #' || coalesce(ch.name, 'a channel'),
          preview, '/chat'
        );
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_message_recipients();


-- Segments: notify a person when they're assigned a role.
create or replace function public.notify_role_assigned()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  seg_title text;
begin
  select title into seg_title from public.segments where id = new.segment_id;
  insert into public.notifications (user_id, type, title, body, link_url)
  values (
    new.user_id, 'role_assigned',
    'You were assigned ' || new.role_type,
    seg_title,
    '/segments/' || new.segment_id
  );
  return new;
end;
$$;

drop trigger if exists segment_roles_notify on public.segment_roles;
create trigger segment_roles_notify
  after insert on public.segment_roles
  for each row execute function public.notify_role_assigned();

-- =============================================
-- DONE!
-- =============================================
