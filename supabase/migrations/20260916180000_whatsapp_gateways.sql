-- Per-user Green-API (or compatible) WhatsApp gateway credentials.
-- The webhook Edge Function looks up instance_id from inbound Green-API payloads.

create table if not exists public.whatsapp_gateways (
  user_id uuid primary key references public.users (id) on delete cascade,
  provider text not null default 'green-api',
  instance_id text not null,
  api_token text not null,
  api_url text not null default 'https://api.greenapi.com',
  webhook_token text,
  instance_wid text,
  last_state text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint whatsapp_gateways_provider_check
    check (provider in ('green-api', 'whapi', 'meta')),
  constraint whatsapp_gateways_instance_id_check
    check (char_length(trim(instance_id)) >= 4)
);

create unique index if not exists whatsapp_gateways_instance_id_idx
  on public.whatsapp_gateways (instance_id);

comment on table public.whatsapp_gateways is
  'WhatsApp gateway credentials for inbound capture (Green-API Developer is the free default)';

alter table public.whatsapp_gateways enable row level security;

drop policy if exists whatsapp_gateways_select_own on public.whatsapp_gateways;
create policy whatsapp_gateways_select_own
  on public.whatsapp_gateways for select
  using (auth.uid() = user_id);

drop policy if exists whatsapp_gateways_insert_own on public.whatsapp_gateways;
create policy whatsapp_gateways_insert_own
  on public.whatsapp_gateways for insert
  with check (auth.uid() = user_id);

drop policy if exists whatsapp_gateways_update_own on public.whatsapp_gateways;
create policy whatsapp_gateways_update_own
  on public.whatsapp_gateways for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists whatsapp_gateways_delete_own on public.whatsapp_gateways;
create policy whatsapp_gateways_delete_own
  on public.whatsapp_gateways for delete
  using (auth.uid() = user_id);
