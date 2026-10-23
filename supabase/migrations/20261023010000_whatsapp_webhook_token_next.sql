-- Zero-downtime webhook token rotation: while set, the webhook also accepts this token.
-- Normally null. Applied to production via the Management API on 2026-10-23.
alter table public.whatsapp_gateways add column if not exists webhook_token_next text;
comment on column public.whatsapp_gateways.webhook_token_next is
  'Temporary: second accepted webhook token during rotation. Normally null.';
