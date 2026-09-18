-- Storage: service_role only for writes; clients keep own-folder SELECT.
drop policy if exists "Service role manages source files" on storage.objects;

create policy "Service role manages source files"
  on storage.objects for all
  to service_role
  using (bucket_id = 'source-materials')
  with check (bucket_id = 'source-materials');

-- Calendar flag is set only by the OAuth callback (service role).
revoke update (google_calendar_enabled) on table public.users from anon, authenticated;

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
  new.phone := old.phone;
  new.phone_verified := old.phone_verified;
  new.phone_pending := old.phone_pending;
  new.phone_verify_hash := old.phone_verify_hash;
  new.phone_verify_expires_at := old.phone_verify_expires_at;
  new.google_refresh_token := old.google_refresh_token;
  new.google_calendar_enabled := old.google_calendar_enabled;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  return new;
end;
$$;
