-- Per-device tokens for the voice-ingest Edge Function.
-- The plaintext token is shown once by scripts/mint-device-token.mjs.
-- Only the SHA-256 hex is stored. Authenticated clients cannot read this table.

alter type public.source_type add value if not exists 'voice';

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  request_timestamps timestamptz[] not null default '{}',
  constraint device_tokens_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint device_tokens_hash_sha256 check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.device_tokens is
  'Device bearer tokens for voice-ingest. token_hash is SHA-256 hex. Mint with node --experimental-strip-types scripts/mint-device-token.mjs';
comment on column public.device_tokens.token_hash is 'SHA-256 hex of the plaintext bearer token. Never store or return the plaintext.';
comment on column public.device_tokens.request_timestamps is 'Recent voice-ingest attempts, pruned to the last hour. Limit is 60 per token.';

create unique index if not exists device_tokens_token_hash_uidx
  on public.device_tokens (token_hash);

create index if not exists device_tokens_user_id_idx
  on public.device_tokens (user_id);

create unique index if not exists mindtasker_items_voice_client_id_uidx
  on public.mindtasker_items (user_id, (metadata->>'voice_client_id'))
  where deleted_at is null
    and coalesce(metadata->>'voice_client_id', '') <> '';

alter table public.device_tokens enable row level security;

revoke all on table public.device_tokens from anon, authenticated;
