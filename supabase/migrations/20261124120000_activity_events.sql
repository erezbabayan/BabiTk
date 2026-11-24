-- Silent server-side activity log for the external Babi Admin site (step 2).
-- Metadata only: who (user id), what kind of server call, which Israel day,
-- first time seen that day. No content, recordings, emails, phones or tokens.
--
-- One row per (system, user_id, event_type, day): writers use
-- INSERT ... ON CONFLICT DO NOTHING, so volume is bounded by
-- users x event types x days and the table stays tiny on the free tier.
--
-- system = 'tk'   -> user_id is auth.users.id (BabiTk user)
-- system = 'snap' -> user_id is public.snap_users.id (BabiSnap install row)
-- No FK because user_id points at two different tables by system.
--
-- Access: service_role only (Edge Functions). RLS on, no policies, and no
-- grants for anon/authenticated. Read by Babi Admin through admin-read only.
-- Does not touch any existing table. Separate from public.usage_events.
--
-- Rollback: supabase/rollbacks/20261124120000_activity_events.rollback.sql

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  system text not null default 'tk' check (system in ('tk', 'snap')),
  user_id uuid not null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,39}$'),
  day date not null,
  occurred_at timestamptz not null default now(),
  constraint activity_events_daily_key unique (system, user_id, event_type, day)
);

-- Babi Admin lists newest first and filters by day.
create index if not exists activity_events_day_idx on public.activity_events (day desc);

alter table public.activity_events enable row level security;
-- No policies: anon/authenticated get nothing. Only service_role bypasses RLS.
revoke all on table public.activity_events from public, anon, authenticated;
grant all on table public.activity_events to service_role;
