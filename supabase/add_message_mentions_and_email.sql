-- =============================================
-- TNN Platform - Rich mention chips + structured email messages
-- Run after add_chat_and_tasks.sql
-- =============================================

-- Structured mention list captured at send time: [{type, id, label}, ...]
-- type is 'user' | 'segment' | 'subtask' | 'task' | 'everyone'
alter table public.messages
  add column if not exists mentions jsonb not null default '[]'::jsonb;

-- When set, the message renders as a structured "email" card instead of
-- plain text. email_to is [{id, label, email}, ...].
alter table public.messages
  add column if not exists email_subject text;

alter table public.messages
  add column if not exists email_to jsonb;

-- =============================================
-- DONE!
-- =============================================
