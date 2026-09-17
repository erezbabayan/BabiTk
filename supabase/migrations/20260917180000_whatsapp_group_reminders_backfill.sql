-- Connected WhatsApp groups should receive item/note reminders.
-- The leftover notify_whatsapp_group default (false) blocked every send.
alter table public.users
  alter column notify_whatsapp_group set default true;

update public.users
set notify_whatsapp_group = true
where coalesce(whatsapp_capture_group_chat_id, '') ilike '%@g.us';

comment on column public.users.notify_whatsapp_group is
  'When a capture group (@g.us) is connected, due item/note reminders are sent there. This flag stays on after bind so settings match delivery.';
