-- Speed up WhatsApp idempotency lookups by message id.
create index if not exists mindtasker_items_whatsapp_message_id_idx
  on public.mindtasker_items ((metadata->>'whatsapp_message_id'))
  where deleted_at is null
    and metadata->>'whatsapp_message_id' is not null;

create index if not exists source_materials_whatsapp_message_id_idx
  on public.source_materials ((metadata->>'whatsapp_message_id'))
  where metadata->>'whatsapp_message_id' is not null;
