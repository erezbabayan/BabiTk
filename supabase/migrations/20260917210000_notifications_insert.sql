-- Allow the signed-in user to insert their own in-app notifications
-- (client-side due-date reminders + push registration side effects).

drop policy if exists "Users can insert own notifications" on public.user_notifications;
create policy "Users can insert own notifications"
  on public.user_notifications for insert
  with check (auth.uid() = user_id);
