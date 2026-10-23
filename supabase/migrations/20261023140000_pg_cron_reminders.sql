-- Run the WhatsApp reminder dispatcher from the database instead of GitHub Actions cron.
--
-- GitHub's scheduled workflows are throttled to one run every 3-5 hours, so the
-- "every 15 minutes" reminder workflow fired hours late. pg_cron + pg_net (free,
-- built into Supabase) call the same Edge Function every 5 minutes.
--
-- Auth: the bearer token is read at runtime from Supabase Vault
-- (secret name 'babitk_reminder_cron_secret'); the Edge Function compares it to its
-- REMINDER_CRON_SECRET env. No secret is stored in this file, in cron.job, or in git.
-- If the vault secret is missing the job logs a warning and does nothing.
--
-- Single-flight: public.try_acquire_cron_lease lets one cron run in at a time so the
-- pg_cron tick and the GitHub backup can never overlap and double-send.
-- Idempotent: safe to re-run.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- single-flight lease
create table if not exists public.cron_leases (
  name text primary key,
  holder uuid not null,
  expires_at timestamptz not null
);
alter table public.cron_leases enable row level security;
revoke all on table public.cron_leases from public, anon, authenticated;

comment on table public.cron_leases is
  'Single-flight leases for cron dispatchers (whatsapp-send-reminders). Service role only.';

create or replace function public.try_acquire_cron_lease(p_name text, p_ttl_seconds integer default 240)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holder uuid := gen_random_uuid();
  v_got uuid;
begin
  insert into public.cron_leases as l (name, holder, expires_at)
  values (p_name, v_holder, now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 240), 1)))
  on conflict (name) do update
    set holder = excluded.holder, expires_at = excluded.expires_at
    where l.expires_at <= now()
  returning holder into v_got;
  return v_got; -- null when another run holds an unexpired lease
end;
$$;

create or replace function public.release_cron_lease(p_name text, p_holder uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.cron_leases where name = p_name and holder = p_holder;
$$;

revoke all on function public.try_acquire_cron_lease(text, integer) from public, anon, authenticated;
revoke all on function public.release_cron_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.try_acquire_cron_lease(text, integer) to service_role;
grant execute on function public.release_cron_lease(text, uuid) to service_role;

-- ---------------------------------------------------------------- invoker (reads vault)
create or replace function public.invoke_whatsapp_reminders_cron()
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
  where name = 'babitk_reminder_cron_secret'
  limit 1;

  if v_token is null or length(v_token) < 16 then
    raise warning 'vault secret babitk_reminder_cron_secret is missing; reminder cron skipped';
    return null;
  end if;

  select net.http_post(
    url := 'https://ghibfuinantybqidwadj.supabase.co/functions/v1/whatsapp-send-reminders',
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

revoke all on function public.invoke_whatsapp_reminders_cron() from public, anon, authenticated;

comment on function public.invoke_whatsapp_reminders_cron() is
  'pg_cron entry point: POSTs to whatsapp-send-reminders with the vault cron secret.';

-- ---------------------------------------------------------------- schedules
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('babitk-whatsapp-reminders', 'babitk-cron-history-purge');
end;
$$;

-- Item/list reminders, daily digest, morning briefing, follow-up, weekly summary,
-- notebook reminder: all in one dispatcher, every 5 minutes.
select cron.schedule(
  'babitk-whatsapp-reminders',
  '*/5 * * * *',
  $job$select public.invoke_whatsapp_reminders_cron()$job$
);

-- Keep pg_cron history small (pg_net purges its own responses after 6h).
select cron.schedule(
  'babitk-cron-history-purge',
  '17 3 * * *',
  $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$
);
