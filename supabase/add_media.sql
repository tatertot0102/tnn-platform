-- Segment media: each segment can point at a folder on the media server (the
-- Mac), and anyone signed in can make view-only share links for it.
-- Run this once in the Supabase SQL editor.

-- ── Which folder belongs to which segment ──
create table if not exists public.segment_media (
  segment_id  uuid primary key references public.segments(id) on delete cascade,
  folder      text not null check (length(folder) between 1 and 200 and folder !~ '[/\\:]' and folder !~ '^\.'),
  linked_by   uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.segment_media enable row level security;

create policy "Segment media viewable by authenticated users"
  on public.segment_media for select
  using (auth.role() = 'authenticated');

-- Anyone signed in can give a segment its first folder (so the Media tab works
-- for everyone); only execs/admins can re-point or unlink it afterwards.
create policy "Authenticated users can link a folder to a segment"
  on public.segment_media for insert
  with check (auth.role() = 'authenticated');

create policy "Execs can change a segment's folder"
  on public.segment_media for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('exec', 'admin')));

create policy "Execs can unlink a segment's folder"
  on public.segment_media for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('exec', 'admin')));

-- ── View-only share links ──
create table if not exists public.media_share_links (
  id          uuid primary key default gen_random_uuid(),
  segment_id  uuid not null references public.segments(id) on delete cascade,
  -- 256 bits of randomness, hex encoded. This is the whole credential.
  token       text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  label       text check (label is null or length(label) <= 80),
  created_by  uuid not null references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked_at  timestamptz
);
create index if not exists media_share_links_segment_idx on public.media_share_links(segment_id);
alter table public.media_share_links enable row level security;

create policy "Share links viewable by authenticated users"
  on public.media_share_links for select
  using (auth.role() = 'authenticated');

create policy "Anyone signed in can create share links"
  on public.media_share_links for insert
  with check (auth.role() = 'authenticated' and created_by = auth.uid());

-- Revoking = setting revoked_at. The creator or any exec/admin can do it.
create policy "Creators and execs can revoke share links"
  on public.media_share_links for update
  using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('exec', 'admin'))
  );

-- ── Public lookup used by the media server and the /s/<token> page ──
-- Returns nothing unless the link exists, is not revoked and has not expired.
create or replace function public.resolve_media_share(p_token text)
returns table (segment_title text, folder text)
language sql
stable
security definer
set search_path = public
as $$
  select s.title, m.folder
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

-- Revoking may only touch revoked_at; the token, segment and owner are fixed.
create or replace function public.media_share_links_guard()
returns trigger
language plpgsql
as $$
begin
  if new.token is distinct from old.token
     or new.segment_id is distinct from old.segment_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only revoked_at, expires_at and label can change on a share link';
  end if;
  return new;
end;
$$;

drop trigger if exists media_share_links_guard on public.media_share_links;
create trigger media_share_links_guard
  before update on public.media_share_links
  for each row execute function public.media_share_links_guard();
