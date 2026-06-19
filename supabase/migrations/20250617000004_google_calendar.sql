-- Google Calendar integration fields on users

alter table public.users
  add column if not exists google_refresh_token text,
  add column if not exists google_calendar_enabled boolean not null default false;

comment on column public.users.google_refresh_token is 'OAuth refresh token for Google Calendar API';
comment on column public.users.google_calendar_enabled is 'Whether to sync approved tasks with due_date to Google Calendar';
