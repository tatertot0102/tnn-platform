-- =============================================
-- TNN Platform - Database webhooks for the notify function
--
-- Replaces the old slack-notify webhooks. Applied by
-- supabase/apply-webhooks.sh, which substitutes __FUNCTION_URL__ and
-- __ANON_KEY__ from your .env so no key is committed.
--
-- Supabase's "Database Webhooks" are ordinary triggers calling
-- supabase_functions.http_request, which is what this file creates.
-- =============================================

-- Fail early with a clear message if webhooks were never enabled.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'supabase_functions' and p.proname = 'http_request'
  ) then
    raise exception 'Database Webhooks are not enabled. Enable them once in the Supabase dashboard (Database → Webhooks), then rerun this.';
  end if;
end $$;

-- Drop every existing webhook trigger that still points at slack-notify.
do $$
declare
  t record;
begin
  for t in
    select c.relname as table_name, tg.tgname as trigger_name
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not tg.tgisinternal
      and n.nspname = 'public'
      and pg_get_triggerdef(tg.oid) like '%slack-notify%'
  loop
    execute format('drop trigger if exists %I on public.%I', t.trigger_name, t.table_name);
    raise notice 'dropped old webhook % on %', t.trigger_name, t.table_name;
  end loop;
end $$;

-- Role assigned
drop trigger if exists notify_segment_roles on public.segment_roles;
create trigger notify_segment_roles
  after insert on public.segment_roles
  for each row execute function supabase_functions.http_request(
    '__FUNCTION_URL__', 'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer __ANON_KEY__"}',
    '{}', '5000'
  );

-- Task assigned, deadline changed
drop trigger if exists notify_subtasks on public.subtasks;
create trigger notify_subtasks
  after insert or update on public.subtasks
  for each row execute function supabase_functions.http_request(
    '__FUNCTION_URL__', 'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer __ANON_KEY__"}',
    '{}', '5000'
  );

-- Segment status changed
drop trigger if exists notify_segments on public.segments;
create trigger notify_segments
  after update on public.segments
  for each row execute function supabase_functions.http_request(
    '__FUNCTION_URL__', 'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer __ANON_KEY__"}',
    '{}', '5000'
  );

-- Approval needed, approved, changes requested
drop trigger if exists notify_approval_gates on public.approval_gates;
create trigger notify_approval_gates
  after insert or update on public.approval_gates
  for each row execute function supabase_functions.http_request(
    '__FUNCTION_URL__', 'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer __ANON_KEY__"}',
    '{}', '5000'
  );

-- Feedback left on a gate
drop trigger if exists notify_approval_feedback on public.approval_feedback;
create trigger notify_approval_feedback
  after insert on public.approval_feedback
  for each row execute function supabase_functions.http_request(
    '__FUNCTION_URL__', 'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer __ANON_KEY__"}',
    '{}', '5000'
  );

-- Show what is now wired up.
select c.relname as table_name, tg.tgname as trigger_name
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not tg.tgisinternal and n.nspname = 'public'
  and pg_get_triggerdef(tg.oid) like '%functions/v1/notify%'
order by 1;
