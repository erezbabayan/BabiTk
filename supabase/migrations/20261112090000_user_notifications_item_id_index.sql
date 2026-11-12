-- Performance advisor (unindexed_foreign_keys): user_notifications.item_id references
-- mindtasker_items (on delete set null) without a covering index, so deleting items
-- (trash cleanup) has to scan user_notifications. Additive, no data change.
create index if not exists user_notifications_item_id_idx
  on public.user_notifications (item_id)
  where item_id is not null;
