-- Run this in Supabase SQL Editor
-- Adds slack_user_id to profiles table

alter table public.profiles
  add column if not exists slack_user_id text;

-- Allow users to update their own slack_user_id
-- (already covered by existing "Users can update their own profile" policy)
