-- =============================================
-- TNN Platform - Approval gates on segments
--
-- An approval gate is a checkpoint inside a segment's subtask list. It has a
-- description, one named approver, and a due date. The approver is notified
-- when the gate is assigned to them. Anyone on the segment can leave feedback
-- on a gate; feedback (and approve / request-changes decisions) are mirrored
-- into the segment's chat channel as a structured card, the same way emails
-- are.
--
-- Run after add_notifications.sql.
-- =============================================

-- =============================================
-- 1. TABLES
-- =============================================

create table if not exists public.approval_gates (
  id            uuid default gen_random_uuid() primary key,
  segment_id    uuid references public.segments(id) on delete cascade not null,
  milestone_id  uuid references public.milestones(id) on delete set null,
  title         text not null,
  description   text,
  approver_id   uuid references public.profiles(id) on delete set null,
  due_date      date,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'changes_requested')),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id) on delete set null,
  position      int not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now()
);
alter table public.approval_gates enable row level security;

create index if not exists approval_gates_segment_idx on public.approval_gates(segment_id);

-- kind: a plain comment, or the note attached to a decision.
create table if not exists public.approval_feedback (
  id          uuid default gen_random_uuid() primary key,
  gate_id     uuid references public.approval_gates(id) on delete cascade not null,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  kind        text not null default 'comment'
                check (kind in ('comment', 'approved', 'changes_requested')),
  created_at  timestamptz default now()
);
alter table public.approval_feedback enable row level security;

create index if not exists approval_feedback_gate_idx on public.approval_feedback(gate_id);


-- =============================================
-- 2. RLS (mirrors subtasks: everyone reads, members write, execs delete)
-- =============================================

drop policy if exists "Approval gates viewable by authenticated users" on public.approval_gates;
create policy "Approval gates viewable by authenticated users"
  on public.approval_gates for select
  using (auth.role() = 'authenticated');

drop policy if exists "Team members can create approval gates" on public.approval_gates;
create policy "Team members can create approval gates"
  on public.approval_gates for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update approval gates" on public.approval_gates;
create policy "Authenticated users can update approval gates"
  on public.approval_gates for update
  using (auth.role() = 'authenticated');

drop policy if exists "Execs can delete approval gates" on public.approval_gates;
create policy "Execs can delete approval gates"
  on public.approval_gates for delete
  using (public.is_exec(auth.uid()));

drop policy if exists "Approval feedback viewable by authenticated users" on public.approval_feedback;
create policy "Approval feedback viewable by authenticated users"
  on public.approval_feedback for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can leave approval feedback" on public.approval_feedback;
create policy "Authenticated users can leave approval feedback"
  on public.approval_feedback for insert
  with check (auth.uid() = author_id);

drop policy if exists "Authors or execs can delete approval feedback" on public.approval_feedback;
create policy "Authors or execs can delete approval feedback"
  on public.approval_feedback for delete
  using (author_id = auth.uid() or public.is_exec(auth.uid()));


-- =============================================
-- 3. CHAT CARD COLUMNS
-- When approval_gate_id is set, the message renders as an approval card
-- instead of plain text. approval_meta is
-- {gate_title, segment_id, segment_title, kind, status, due_date}.
-- =============================================

alter table public.messages
  add column if not exists approval_gate_id uuid references public.approval_gates(id) on delete set null;

alter table public.messages
  add column if not exists approval_meta jsonb;


-- =============================================
-- 4. NOTIFICATIONS
-- =============================================

-- Notify the approver when a gate is created for them, or reassigned to them.
create or replace function public.notify_approval_gate_assigned()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  seg_title text;
begin
  if new.approver_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.approver_id is not distinct from old.approver_id then
    return new;
  end if;

  select title into seg_title from public.segments where id = new.segment_id;

  insert into public.notifications (user_id, type, title, body, link_url)
  values (
    new.approver_id,
    'approval_requested',
    'Your approval is needed: ' || new.title,
    coalesce(seg_title, 'Segment')
      || case when new.due_date is null then '' else ' · due ' || to_char(new.due_date, 'Mon DD') end,
    '/segments/' || new.segment_id || '?tab=subtasks&gate=' || new.id
  );
  return new;
end;
$$;

drop trigger if exists approval_gates_notify_assigned on public.approval_gates;
create trigger approval_gates_notify_assigned
  after insert or update of approver_id on public.approval_gates
  for each row execute function public.notify_approval_gate_assigned();


-- Notify whoever created the gate when the approver decides.
create or replace function public.notify_approval_gate_decided()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  seg_title text;
  decider_name text;
begin
  if new.status is not distinct from old.status or new.status = 'pending' then
    return new;
  end if;
  if new.created_by is null or new.created_by = new.decided_by then
    return new;
  end if;

  select title into seg_title from public.segments where id = new.segment_id;
  select full_name into decider_name from public.profiles where id = new.decided_by;

  insert into public.notifications (user_id, type, title, body, link_url)
  values (
    new.created_by,
    'approval_decided',
    coalesce(decider_name, 'Someone')
      || case when new.status = 'approved' then ' approved ' else ' requested changes on ' end
      || new.title,
    coalesce(seg_title, 'Segment'),
    '/segments/' || new.segment_id || '?tab=subtasks&gate=' || new.id
  );
  return new;
end;
$$;

drop trigger if exists approval_gates_notify_decided on public.approval_gates;
create trigger approval_gates_notify_decided
  after update of status on public.approval_gates
  for each row execute function public.notify_approval_gate_decided();


-- Notify everyone attached to the gate (approver, creator, earlier commenters)
-- when new feedback lands, and mirror it into the segment's chat channel.
create or replace function public.handle_approval_feedback()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  gate public.approval_gates%rowtype;
  seg_title text;
  author_name text;
  chan_id uuid;
  recipient uuid;
  headline text;
begin
  select * into gate from public.approval_gates where id = new.gate_id;
  if not found then return new; end if;

  select title into seg_title from public.segments where id = gate.segment_id;
  select full_name into author_name from public.profiles where id = new.author_id;

  headline := coalesce(author_name, 'Someone') || case
    when new.kind = 'approved' then ' approved '
    when new.kind = 'changes_requested' then ' requested changes on '
    else ' left feedback on ' end || gate.title;

  -- In-app notifications
  for recipient in
    select distinct uid from (
      select gate.approver_id as uid
      union select gate.created_by
      union select af.author_id from public.approval_feedback af where af.gate_id = new.gate_id
    ) people
    where uid is not null and uid <> new.author_id
  loop
    insert into public.notifications (user_id, type, title, body, link_url)
    values (
      recipient, 'approval_feedback', headline, left(new.body, 140),
      '/segments/' || gate.segment_id || '?tab=subtasks&gate=' || gate.id
    );
  end loop;

  -- Mirror into the segment's chat channel as a structured card. Runs as
  -- security definer so the author does not need to be a channel member.
  select id into chan_id from public.channels
   where segment_id = gate.segment_id
   order by created_at limit 1;

  if chan_id is not null then
    insert into public.messages (channel_id, sender_id, body, approval_gate_id, approval_meta)
    values (
      chan_id, new.author_id, new.body, gate.id,
      jsonb_build_object(
        'gate_title', gate.title,
        'segment_id', gate.segment_id,
        'segment_title', seg_title,
        'kind', new.kind,
        'due_date', gate.due_date
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists approval_feedback_handle on public.approval_feedback;
create trigger approval_feedback_handle
  after insert on public.approval_feedback
  for each row execute function public.handle_approval_feedback();

-- =============================================
-- DONE!
-- =============================================
