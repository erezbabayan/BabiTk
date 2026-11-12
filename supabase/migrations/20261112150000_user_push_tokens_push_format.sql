-- Which push payload this device's app build can present.
-- 'headless_v1' = the app shows server reminders itself (data-only push +
-- background task) so the Android action buttons work when the app is
-- backgrounded or killed. NULL = older build, keep sending the classic
-- Notification Message. Additive, nullable: no effect on existing rows.
alter table public.user_push_tokens
  add column if not exists push_format text;
