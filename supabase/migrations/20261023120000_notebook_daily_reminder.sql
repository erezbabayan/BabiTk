-- Daily reminder of items waiting in the notebook (מחברת = mindtasker_items.status 'inbox').
-- Default ON at 19:00 Asia/Jerusalem. Sent by whatsapp-send-reminders (cron) on the same
-- WhatsApp channel as item reminders. Nothing is sent when the notebook is empty.

alter table public.users
  add column if not exists notebook_reminder_enabled boolean not null default true,
  add column if not exists notebook_reminder_hour integer not null default 19,
  add column if not exists notebook_reminder_minute integer not null default 0,
  add column if not exists notebook_reminder_last_sent_on date;

alter table public.users
  drop constraint if exists users_notebook_reminder_hour_check;
alter table public.users
  add constraint users_notebook_reminder_hour_check
  check (notebook_reminder_hour between 0 and 23);

alter table public.users
  drop constraint if exists users_notebook_reminder_minute_check;
alter table public.users
  add constraint users_notebook_reminder_minute_check
  check (notebook_reminder_minute between 0 and 59);

comment on column public.users.notebook_reminder_enabled is
  'Daily WhatsApp reminder with the number of notebook (inbox) items waiting. Default on. Skipped when the notebook is empty.';
comment on column public.users.notebook_reminder_hour is
  'Local hour (Asia/Jerusalem, 0-23) of the daily notebook reminder. Default 19.';
comment on column public.users.notebook_reminder_minute is
  'Local minute (0-59) of the daily notebook reminder.';
comment on column public.users.notebook_reminder_last_sent_on is
  'Asia/Jerusalem date of the last notebook reminder. Claimed before sending so a user gets at most one per day.';
