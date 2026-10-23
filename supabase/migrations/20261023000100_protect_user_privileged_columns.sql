-- Selective port of the OWASP hardening branch: browser JWTs cannot write billing,
-- quota, OAuth or Stripe columns on public.users (service role / backend unchanged).
-- Done with a BEFORE trigger that silently keeps the stored values, so existing client
-- updates/upserts that happen to include these columns never start failing.
-- Deliberately NOT locked:
--   * tier: the web "upgrade / cancel" buttons set it directly (no payment backend exists).
--   * phone*: already pinned by users_guard_phone_verification (OTP flow via edge function).
--   * email: may only be set to the caller's own auth email, so username login stays in sync.

create or replace function public.protect_user_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  jwt_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
begin
  if jwt_role not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.email := coalesce(jwt_email, new.email);
    new.allocated_audio_seconds := 1800;
    new.used_audio_seconds := 0;
    new.allocated_ai_parses := 50;
    new.used_ai_parses := 0;
    new.usage_period_start := now();
    new.google_refresh_token := null;
    new.google_calendar_enabled := false;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.subscription_status := null;
    return new;
  end if;

  if new.email is distinct from old.email
     and (jwt_email is null or lower(coalesce(new.email, '')) <> jwt_email) then
    new.email := old.email;
  end if;
  new.allocated_audio_seconds := old.allocated_audio_seconds;
  new.used_audio_seconds := old.used_audio_seconds;
  new.allocated_ai_parses := old.allocated_ai_parses;
  new.used_ai_parses := old.used_ai_parses;
  new.usage_period_start := old.usage_period_start;
  new.google_refresh_token := old.google_refresh_token;
  new.google_calendar_enabled := old.google_calendar_enabled;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  return new;
end;
$$;

revoke all on function public.protect_user_privileged_columns() from public, anon, authenticated;

drop trigger if exists users_protect_privileged_columns on public.users;
create trigger users_protect_privileged_columns
  before insert or update on public.users
  for each row
  execute function public.protect_user_privileged_columns();

-- Browser clients never read these.
revoke select (stripe_customer_id, stripe_subscription_id) on table public.users from anon, authenticated;
