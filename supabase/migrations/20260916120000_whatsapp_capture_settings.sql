-- WhatsApp capture group and digest prefs on the Supabase user profile
alter table public.users
  add column if not exists whatsapp_capture_group_chat_id text,
  add column if not exists whatsapp_capture_group_name text,
  add column if not exists whatsapp_digest_hours integer[] not null default array[9]::integer[],
  add column if not exists whatsapp_digest_days text not null default 'everyday';

alter table public.users
  drop constraint if exists users_whatsapp_digest_days_check;

alter table public.users
  add constraint users_whatsapp_digest_days_check
  check (whatsapp_digest_days in ('weekdays', 'everyday'));

comment on column public.users.whatsapp_capture_group_chat_id is
  'WhatsApp chat id for inbound capture (@g.us group or @c.us personal)';
comment on column public.users.whatsapp_capture_group_name is
  'Display name of the configured WhatsApp capture group';
comment on column public.users.whatsapp_digest_hours is
  'Local hours 0–23 for daily WhatsApp reminder digests (max 3)';
comment on column public.users.whatsapp_digest_days is
  'weekdays (Sun–Thu) or everyday';
