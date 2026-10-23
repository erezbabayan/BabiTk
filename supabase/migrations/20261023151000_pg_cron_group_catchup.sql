-- WhatsApp group inbox catch-up on pg_cron (every 10 minutes). NEW messages only:
-- the Edge Function ignores everything at/before users.whatsapp_group_catchup_since
-- (see 20261023150000_group_catchup_watermark.sql) and dedupes by Green-API
-- message id against whatsapp_inbound_seen, mindtasker_items and source_materials.
-- Token comes from Vault at runtime (secret babitk_group_catchup_cron_secret, created
-- out of band; never stored in this file or in cron.job).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_whatsapp_group_catchup_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'babitk_group_catchup_cron_secret'
  limit 1;

  if v_token is null or length(v_token) < 16 then
    raise warning 'vault secret babitk_group_catchup_cron_secret is missing; group catch-up skipped';
    return null;
  end if;

  select net.http_post(
    url := 'https://ghibfuinantybqidwadj.supabase.co/functions/v1/whatsapp-group-catchup',
    body := jsonb_build_object('source', 'pg_cron'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    timeout_milliseconds := 60000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_whatsapp_group_catchup_cron() from public, anon, authenticated;

comment on function public.invoke_whatsapp_group_catchup_cron() is
  'pg_cron entry point: POSTs to whatsapp-group-catchup with the vault cron secret.';

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('babitk-whatsapp-group-catchup', 'babitk-inbound-seen-purge');
end;
$$;

-- Offset by 2 minutes from the 5-minute reminder ticks.
select cron.schedule(
  'babitk-whatsapp-group-catchup',
  '2-59/10 * * * *',
  $job$select public.invoke_whatsapp_group_catchup_cron()$job$
);

-- Ledger only needs to outlive the catch-up lookback (48h); keep 30 days.
select cron.schedule(
  'babitk-inbound-seen-purge',
  '23 3 * * *',
  $job$delete from public.whatsapp_inbound_seen where seen_at < now() - interval '30 days'$job$
);
