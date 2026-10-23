-- Token rotation finished (#158 / #159): the edge function only reads webhook_token again.
alter table public.whatsapp_gateways drop column if exists webhook_token_next;
