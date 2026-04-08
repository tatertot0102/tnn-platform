-- =============================================
-- TNN Platform - Supabase Schema
-- Run this entire file in your Supabase SQL editor
-- =============================================

-- 1. PROFILES (extends Supabase auth.users)
create table public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  full_name   text not null default '',
  email       text,
  role        text not null default 'member' check (role in ('member', 'exec', 'admin')),
  avatar_url  text,
  created_at  timestamptz default now()
);
alter table public.profiles enable row level security;

-- Members can read all profiles (to see team members)
create policy "Profiles are viewable by all authenticated users"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Users can update their own profile
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Admins/execs can update any profile (for role changes)
create policy "Execs can update any profile"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2. SEGMENTS
create table public.segments (
  id           uuid default gen_random_uuid() primary key,
  title        text not null,
  priority     text not null default 'medium' check (priority in ('ultra-high','high','medium','low','tbd')),
  status       text not null default 'not-started' check (status in ('not-started','in-progress','blocked','done')),
  departments  text[] default '{}',
  start_date   date,
  due_date     date,
  notes        text default '',
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.segments enable row level security;

-- All authenticated users can view segments
create policy "Segments viewable by all authenticated users"
  on public.segments for select
  using (auth.role() = 'authenticated');

-- Only execs/admins can create segments
create policy "Execs can create segments"
  on public.segments for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );

-- Only execs/admins can update segments
create policy "Execs can update segments"
  on public.segments for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );

-- Only execs/admins can delete segments
create policy "Execs can delete segments"
  on public.segments for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger segments_updated_at
  before update on public.segments
  for each row execute function public.handle_updated_at();


-- 3. SEGMENT ROLES (who does what on each segment)
create table public.segment_roles (
  id           uuid default gen_random_uuid() primary key,
  segment_id   uuid references public.segments(id) on delete cascade not null,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  role_type    text not null,  -- 'Script Writer', 'Director', 'Video Editor', etc.
  created_at   timestamptz default now(),
  unique(segment_id, role_type)
);
alter table public.segment_roles enable row level security;

create policy "Segment roles viewable by authenticated users"
  on public.segment_roles for select
  using (auth.role() = 'authenticated');

create policy "Execs can manage segment roles"
  on public.segment_roles for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );


-- 4. SUBTASKS
create table public.subtasks (
  id           uuid default gen_random_uuid() primary key,
  segment_id   uuid references public.segments(id) on delete cascade not null,
  title        text not null,
  completed    boolean default false,
  assignee_id  uuid references public.profiles(id),
  due_date     date,
  created_at   timestamptz default now()
);
alter table public.subtasks enable row level security;

create policy "Subtasks viewable by authenticated users"
  on public.subtasks for select
  using (auth.role() = 'authenticated');

-- Anyone assigned to the segment can add subtasks
create policy "Team members can create subtasks"
  on public.subtasks for insert
  with check (auth.role() = 'authenticated');

-- Anyone can update subtasks (check off items)
create policy "Authenticated users can update subtasks"
  on public.subtasks for update
  using (auth.role() = 'authenticated');

-- Execs can delete subtasks
create policy "Execs can delete subtasks"
  on public.subtasks for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );


-- 5. TASKS (standalone, not tied to a segment)
create table public.tasks (
  id           uuid default gen_random_uuid() primary key,
  title        text not null,
  priority     text not null default 'medium' check (priority in ('ultra-high','high','medium','low','tbd')),
  status       text not null default 'not-started' check (status in ('not-started','in-progress','blocked','done')),
  department   text,
  assignee_ids uuid[] default '{}',
  due_date     date,
  notes        text default '',
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.tasks enable row level security;

create policy "Tasks viewable by authenticated users"
  on public.tasks for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can create tasks"
  on public.tasks for insert
  with check (auth.role() = 'authenticated');

create policy "Execs or task creator can update tasks"
  on public.tasks for update
  using (
    auth.uid() = created_by or
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );

create policy "Execs can delete tasks"
  on public.tasks for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('exec', 'admin')
    )
  );

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.handle_updated_at();


-- =============================================
-- DONE! Your schema is ready.
-- Next steps are in README.md
-- =============================================
