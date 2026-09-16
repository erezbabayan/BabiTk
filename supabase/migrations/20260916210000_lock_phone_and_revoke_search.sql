-- Clients must not rewrite phone while keeping phone_verified.
-- Semantic search RPCs are service-role only (SECURITY DEFINER + caller-supplied user id).

revoke update (phone) on table public.users from anon, authenticated;

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
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  return new;
end;
$$;

revoke all on function public.search_notes_for_user(uuid, vector, integer, double precision)
  from public, anon, authenticated;
grant execute on function public.search_notes_for_user(uuid, vector, integer, double precision)
  to service_role;

revoke all on function public.search_items_for_user(uuid, vector, integer, double precision, text)
  from public, anon, authenticated;
grant execute on function public.search_items_for_user(uuid, vector, integer, double precision, text)
  to service_role;
