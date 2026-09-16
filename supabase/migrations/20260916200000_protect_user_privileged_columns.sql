-- Privilege hardening for public.users
-- Clients (authenticated JWT) must not read secrets or write billing/quota/verification fields.
-- Service role (backend / Edge Functions) keeps full access.

revoke select (
  google_refresh_token,
  phone_verify_hash,
  phone_verify_expires_at,
  stripe_customer_id,
  stripe_subscription_id
) on table public.users from anon, authenticated;

revoke update (
  email,
  tier,
  allocated_audio_seconds,
  used_audio_seconds,
  allocated_ai_parses,
  used_ai_parses,
  usage_period_start,
  phone_verified,
  phone_pending,
  phone_verify_hash,
  phone_verify_expires_at,
  google_refresh_token,
  stripe_customer_id,
  stripe_subscription_id,
  subscription_status
) on table public.users from anon, authenticated;

create or replace function public.protect_user_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(auth.role(), '');
  -- Only lock privileged columns for browser/anon JWTs.
  -- service_role, postgres, and other backend roles keep full writes.
  if jwt_role not in ('authenticated', 'anon') then
    return new;
  end if;

  new.email := old.email;
  new.tier := old.tier;
  new.allocated_audio_seconds := old.allocated_audio_seconds;
  new.used_audio_seconds := old.used_audio_seconds;
  new.allocated_ai_parses := old.allocated_ai_parses;
  new.used_ai_parses := old.used_ai_parses;
  new.usage_period_start := old.usage_period_start;
  new.phone_verified := old.phone_verified;
  new.phone_pending := old.phone_pending;
  new.phone_verify_hash := old.phone_verify_hash;
  new.phone_verify_expires_at := old.phone_verify_expires_at;
  new.google_refresh_token := old.google_refresh_token;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  return new;
end;
$$;

drop trigger if exists users_protect_privileged_columns on public.users;
create trigger users_protect_privileged_columns
  before update on public.users
  for each row
  execute function public.protect_user_privileged_columns();
