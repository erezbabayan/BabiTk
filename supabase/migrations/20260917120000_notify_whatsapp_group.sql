-- Opt-in: send due reminders as WhatsApp messages to the configured capture group.
alter table public.users
  add column if not exists notify_whatsapp_group boolean not null default false;

comment on column public.users.notify_whatsapp_group is
  'When true, due item/list reminders are sent to the configured WhatsApp capture group';
