-- Slot keys "YYYY-MM-DD:H" so each configured digest hour sends once per day.
alter table public.users
  add column if not exists whatsapp_digest_slots text[] not null default array[]::text[];

comment on column public.users.whatsapp_digest_slots is
  'WhatsApp digest hours already sent, as YYYY-MM-DD:H in Asia/Jerusalem';
