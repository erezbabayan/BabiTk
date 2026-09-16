-- Speed up WhatsApp/task reminder cron: only open items with a due date.
create index if not exists mindtasker_items_due_reminders_idx
  on public.mindtasker_items (due_date)
  where deleted_at is null
    and status in ('inbox', 'pending')
    and due_date is not null;
