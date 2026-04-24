-- Run in Supabase SQL Editor

-- 1. Drive folder link on segments
alter table public.segments
  add column if not exists drive_url text;

-- 2. Guest contributors (temp people on a segment)
alter table public.segment_roles
  add column if not exists is_guest boolean default false;

-- Drop old unique constraint and re-add allowing multiple guests per segment
-- (guests can have same role_type)
alter table public.segment_roles
  drop constraint if exists segment_roles_segment_id_role_type_key;

-- New unique constraint: one person per role per segment (guests can stack)
create unique index if not exists segment_roles_unique_permanent
  on public.segment_roles (segment_id, role_type)
  where is_guest = false;
