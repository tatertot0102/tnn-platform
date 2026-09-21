-- =============================================
-- TNN Platform - Multiple approvers per approval gate
--
-- A gate can now have any number of approvers, picked from every platform
-- member (not just the segment team). Each approver decides separately; the
-- gate's own status is derived from their decisions:
--   anyone requested changes  -> changes_requested
--   everyone approved         -> approved
--   otherwise                 -> pending
--
-- approval_gates.approver_id is kept for now but is no longer written.
--
-- Also adds the segment work tables to realtime so the segment page updates
-- live. Run after add_approval_gates.sql.
-- =============================================

-- =============================================
-- 1. TABLE
-- =============================================

create table if not exists public.approval_gate_approvers (
  gate_id     uuid references public.approval_gates(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'changes_requested')),
  decided_at  timestamptz,
  created_at  timestamptz default now(),
  primary key (gate_id, user_id)
);
alter table public.approval_gate_approvers enable row level security;

create index if not exists approval_gate_approvers_user_idx on public.approval_gate_approvers(user_id);

-- Realtime DELETE events only carry the primary key unless this is set.
alter table public.approval_gate_approvers replica identity full;


-- =============================================
-- 2. RLS: everyone reads, members manage the list, each approver
--    records only their own decision.
-- =============================================

drop policy if exists "Gate approvers viewable by authenticated users" on public.approval_gate_approvers;
create policy "Gate approvers viewable by authenticated users"
  on public.approval_gate_approvers for select
  using (auth.role() = 'authenticated');

drop policy if exists "Members can add gate approvers" on public.approval_gate_approvers;
create policy "Members can add gate approvers"
  on public.approval_gate_approvers for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Members can remove gate approvers" on public.approval_gate_approvers;
create policy "Members can remove gate approvers"
  on public.approval_gate_approvers for delete
  using (auth.role() = 'authenticated');

drop policy if exists "Approvers record their own decision" on public.approval_gate_approvers;
create policy "Approvers record their own decision"
  on public.approval_gate_approvers for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- =============================================
-- 3. BACKFILL from the single approver column
-- =============================================

insert into public.approval_gate_approvers (gate_id, user_id, status, decided_at)
select g.id, g.approver_id, g.status, g.decided_at
from public.approval_gates g
where g.approver_id is not null
on conflict (gate_id, user_id) do nothing;


-- =============================================
-- 4. DERIVE THE GATE STATUS FROM ITS APPROVERS
-- Updating approval_gates.status keeps the existing "decided" notification,
-- the notify webhook, and the blocking logic working unchanged.
-- =============================================

create or replace function public.recompute_gate_status()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  target_gate uuid := coalesce(new.gate_id, old.gate_id);
  total int;
  approved_count int;
  changes_count int;
  next_status text;
  last_decider uuid;
  last_decided_at timestamptz;
begin
  select count(*),
         count(*) filter (where status = 'approved'),
         count(*) filter (where status = 'changes_requested')
    into total, approved_count, changes_count
    from public.approval_gate_approvers where gate_id = target_gate;

  next_status := case
    when changes_count > 0 then 'changes_requested'
    when total > 0 and approved_count = total then 'approved'
    else 'pending'
  end;

  select user_id, decided_at into last_decider, last_decided_at
    from public.approval_gate_approvers
   where gate_id = target_gate and status <> 'pending' and decided_at is not null
   order by decided_at desc limit 1;

  update public.approval_gates
     set status     = next_status,
         decided_by = case when next_status = 'pending' then null else last_decider end,
         decided_at = case when next_status = 'pending' then null else last_decided_at end
   where id = target_gate
     and status is distinct from next_status;

  return null;
end;
$$;

drop trigger if exists approval_gate_approvers_recompute on public.approval_gate_approvers;
create trigger approval_gate_approvers_recompute
  after insert or update or delete on public.approval_gate_approvers
  for each row execute function public.recompute_gate_status();


-- =============================================
-- 5. IN-APP NOTIFICATIONS
-- =============================================

-- "Your approval is needed" now fires per approver row, not on approver_id.
drop trigger if exists approval_gates_notify_assigned on public.approval_gates;

create or replace function public.notify_gate_approver_added()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  gate public.approval_gates%rowtype;
  seg_title text;
begin
  select * into gate from public.approval_gates where id = new.gate_id;
  if not found then return new; end if;
  if new.user_id = auth.uid() then return new; end if;  -- added yourself

  select title into seg_title from public.segments where id = gate.segment_id;

  insert into public.notifications (user_id, type, title, body, link_url)
  values (
    new.user_id,
    'approval_requested',
    'Your approval is needed: ' || gate.title,
    coalesce(seg_title, 'Segment')
      || case when gate.due_date is null then '' else ' · due ' || to_char(gate.due_date, 'Mon DD') end,
    '/segments/' || gate.segment_id || '?tab=subtasks&gate=' || gate.id
  );
  return new;
end;
$$;

drop trigger if exists approval_gate_approvers_notify on public.approval_gate_approvers;
create trigger approval_gate_approvers_notify
  after insert on public.approval_gate_approvers
  for each row execute function public.notify_gate_approver_added();

-- Feedback now notifies every approver, plus the creator and earlier commenters.
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

  for recipient in
    select distinct uid from (
      select a.user_id as uid from public.approval_gate_approvers a where a.gate_id = new.gate_id
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

  -- Mirror into the segment's chat channel as a structured card.
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


-- =============================================
-- 6. REALTIME for the segment page
-- =============================================

do $$
declare
  t text;
begin
  foreach t in array array['subtasks', 'milestones', 'approval_gates', 'approval_gate_approvers', 'approval_feedback']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =============================================
-- DONE!
-- =============================================
