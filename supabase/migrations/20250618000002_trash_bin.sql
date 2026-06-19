-- Allow users to view their own soft-deleted items (trash bin, up to 30 days)
create policy "Users can view own trash items"
  on public.mindtasker_items for select
  using (
    auth.uid() = user_id
    and deleted_at is not null
    and deleted_at > (now() - interval '30 days')
  );

create index if not exists idx_mindtasker_items_trash
  on public.mindtasker_items (user_id, deleted_at)
  where deleted_at is not null;
