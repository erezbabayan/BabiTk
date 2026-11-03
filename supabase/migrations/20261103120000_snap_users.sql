-- BabiSnap Google users registry (Stage A). Metadata only: no recordings,
-- transcripts or calendar content are ever stored here.
create table if not exists public.snap_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  install_id text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  app_version text,
  sources text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'blocked', 'disconnected')),
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint snap_users_email_lowercase check (email = lower(email)),
  constraint snap_users_sources_allowed check (sources <@ array['google_calendar', 'babitk']::text[])
);

-- "email unique": one registry row per (email, install) pair; email lookups use the email index.
create unique index if not exists snap_users_email_install_key on public.snap_users (email, install_id);
create index if not exists snap_users_email_idx on public.snap_users (email);

alter table public.snap_users enable row level security;
-- No policies: anon/authenticated get nothing. Only service_role (edge function) bypasses RLS.
revoke all on table public.snap_users from public, anon, authenticated;
grant all on table public.snap_users to service_role;
