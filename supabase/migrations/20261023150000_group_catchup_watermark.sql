-- WhatsApp group inbox catch-up: NEW messages only.
-- whatsapp_group_catchup_since: per-user watermark for the user's capture group.
--   Catch-up ignores every Green-API message whose timestamp is <= this moment.
--   NULL = catch-up has never been enabled for the user; the scheduled catch-up
--   then sets it to now() and imports nothing on that run.
-- whatsapp_inbound_seen: ledger of Green-API message ids already handled
--   (by the live webhook or by catch-up). PK makes the catch-up claim atomic.

alter table public.users
  add column if not exists whatsapp_group_catchup_since timestamptz;

comment on column public.users.whatsapp_group_catchup_since is
  'Group inbox catch-up watermark: messages at or before this time are never imported.';

-- Set the watermark once, for every user that already has a capture group bound or named.
update public.users
   set whatsapp_group_catchup_since = now()
 where whatsapp_group_catchup_since is null
   and (whatsapp_capture_group_chat_id is not null
        or coalesce(whatsapp_capture_group_name, '') <> '');

create table if not exists public.whatsapp_inbound_seen (
  user_id uuid not null references public.users(id) on delete cascade,
  message_id text not null,
  via text not null default 'webhook',
  seen_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index if not exists whatsapp_inbound_seen_seen_at_idx
  on public.whatsapp_inbound_seen (seen_at);

alter table public.whatsapp_inbound_seen enable row level security;
revoke all on public.whatsapp_inbound_seen from public, anon, authenticated;
grant select, insert, delete on public.whatsapp_inbound_seen to service_role;
