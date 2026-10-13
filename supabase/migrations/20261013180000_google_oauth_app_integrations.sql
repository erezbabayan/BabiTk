-- App-level Google OAuth client, readable only by the service role.
create table if not exists public.app_integrations (
  key text primary key,
  google_client_id text,
  google_client_secret text,
  updated_at timestamptz not null default now()
);

comment on table public.app_integrations is
  'Single-row app secrets such as the Google Calendar OAuth client. Not exposed to clients.';

alter table public.app_integrations enable row level security;

revoke all on table public.app_integrations from anon, authenticated;
grant all on table public.app_integrations to service_role;
