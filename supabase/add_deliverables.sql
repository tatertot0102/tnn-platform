-- Drafts and finals: files in a segment's media folder marked as a draft or
-- the final cut, optionally attached to a subtask or approval gate.
-- Also lets share links show only the final. Run once in the SQL editor
-- (after add_media.sql).

create table if not exists public.segment_deliverables (
  id          uuid primary key default gen_random_uuid(),
  segment_id  uuid not null references public.segments(id) on delete cascade,
  -- Path relative to the media root, e.g. 'Homecoming/Drafts/cut v2.mp4'.
  path        text not null check (length(path) between 1 and 1000 and path !~ '(^|/)\.' and path !~ '[\\:]'),
  stage       text not null check (stage in ('draft', 'final')),
  subtask_id  uuid references public.subtasks(id) on delete set null,
  gate_id     uuid references public.approval_gates(id) on delete set null,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (segment_id, path)
);
create index if not exists segment_deliverables_subtask_idx on public.segment_deliverables(subtask_id);
create index if not exists segment_deliverables_gate_idx on public.segment_deliverables(gate_id);
alter table public.segment_deliverables enable row level security;

create policy "Deliverables viewable by authenticated users"
  on public.segment_deliverables for select
  using (auth.role() = 'authenticated');

create policy "Anyone signed in can add deliverables"
  on public.segment_deliverables for insert
  with check (auth.role() = 'authenticated');

create policy "Anyone signed in can update deliverables"
  on public.segment_deliverables for update
  using (auth.role() = 'authenticated');

-- Unmarking a file (the file itself is never touched).
create policy "Creators and execs can unmark deliverables"
  on public.segment_deliverables for delete
  using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('exec', 'admin'))
  );

-- ── Share links that show only the final ──
alter table public.media_share_links add column if not exists finals_only boolean not null default false;

drop function if exists public.resolve_media_share(text);
create function public.resolve_media_share(p_token text)
returns table (segment_title text, folder text, finals_only boolean, finals text[])
language sql
stable
security definer
set search_path = public
as $$
  select s.title, m.folder, l.finals_only,
    coalesce((select array_agg(d.path) from public.segment_deliverables d
              where d.segment_id = l.segment_id and d.stage = 'final'), '{}')
  from public.media_share_links l
  join public.segments s on s.id = l.segment_id
  join public.segment_media m on m.segment_id = l.segment_id
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now())
  limit 1;
$$;

revoke all on function public.resolve_media_share(text) from public;
grant execute on function public.resolve_media_share(text) to anon, authenticated;
