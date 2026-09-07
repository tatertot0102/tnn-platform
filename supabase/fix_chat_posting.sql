-- =============================================
-- TNN Platform - Let execs post in every channel they can see
-- Run after add_chat_and_tasks.sql
-- =============================================
--
-- The sidebar shows execs every channel, but the old insert policy required
-- membership, so an exec posting (or emailing) into a channel they were not
-- a member of failed with a generic "row violates row-level security policy".
-- That is what made chat emails silently stop working in most channels.
--
-- The new policy also enforces announcement channels server-side: the UI
-- already blocks non-execs there, but nothing stopped a direct insert.

drop policy if exists "Members can post unless channel is read-only for them" on public.messages;
create policy "Members can post unless channel is read-only for them"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_exec(auth.uid())
      or (
        public.is_channel_member(messages.channel_id, auth.uid())
        and not exists (
          select 1 from public.channels c
          where c.id = messages.channel_id
            and (c.read_only or c.type = 'announcement')
        )
      )
    )
  );

-- Same gap on the membership side: adding an email recipient to a channel
-- required the sender to already be a member, so execs could not pull people
-- into a channel they were emailing from.
drop policy if exists "Members can add people to channels they're in" on public.channel_members;
create policy "Members can add people to channels they're in"
  on public.channel_members for insert
  with check (
    public.is_exec(auth.uid())
    or public.is_channel_member(channel_members.channel_id, auth.uid())
  );

-- =============================================
-- DONE!
-- =============================================
