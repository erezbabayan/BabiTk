-- Manual drag-and-drop ordering within dashboard columns
alter table public.mindtasker_items
  add column if not exists sort_order double precision not null default 0;

create index if not exists mindtasker_items_user_column_sort_idx
  on public.mindtasker_items (user_id, status, is_actionable, sort_order)
  where deleted_at is null;
