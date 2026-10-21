-- OTP state for WhatsApp phone linking.
-- The plaintext code is never stored. phone_verify_hash is SHA-256 of the 6 digits.
-- Existing rows that already have a linked phone stay verified so current
-- capture and reminders keep working.

alter table public.users
  add column if not exists phone_verify_attempts integer not null default 0,
  add column if not exists phone_verify_sent_at timestamptz[] not null default '{}';

comment on column public.users.phone_verify_attempts is 'Wrong OTP guesses for the current code. Reset when a new code is sent. Max 5.';
comment on column public.users.phone_verify_sent_at is 'Timestamps of OTP sends. At most 3 in the last hour per user.';

update public.users
set phone_verified = true
where phone is not null
  and length(btrim(phone)) > 0
  and phone_verified = false;

-- Signed-in clients must not mark their own phone verified. Service role
-- (edge function / backend) and direct SQL still can.
create or replace function public.guard_phone_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if jwt_role = 'service_role' or jwt_role = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.phone := null;
    new.phone_verified := false;
    new.phone_pending := null;
    new.phone_verify_hash := null;
    new.phone_verify_expires_at := null;
    new.phone_verify_attempts := 0;
    new.phone_verify_sent_at := '{}';
    return new;
  end if;

  new.phone := old.phone;
  new.phone_verified := old.phone_verified;
  new.phone_pending := old.phone_pending;
  new.phone_verify_hash := old.phone_verify_hash;
  new.phone_verify_expires_at := old.phone_verify_expires_at;
  new.phone_verify_attempts := old.phone_verify_attempts;
  new.phone_verify_sent_at := old.phone_verify_sent_at;
  return new;
end;
$$;

drop trigger if exists users_guard_phone_verification on public.users;
create trigger users_guard_phone_verification
  before insert or update on public.users
  for each row
  execute function public.guard_phone_verification();
