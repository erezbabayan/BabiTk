-- Phone verification fields for WhatsApp linking
alter table public.users
  add column if not exists phone_pending text,
  add column if not exists phone_verify_hash text,
  add column if not exists phone_verify_expires_at timestamptz;

comment on column public.users.phone_pending is 'E.164 number awaiting OTP verification';
comment on column public.users.phone_verify_hash is 'SHA-256 hash of pending verification code';
