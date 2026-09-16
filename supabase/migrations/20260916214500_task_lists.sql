-- Curated task lists on the today board ("הרשימה").
-- Lists are tag-filtered views of live board tasks (same UX as the old Convex feature).

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  filter_tags text[] not null default '{}',
  reminder_at timestamptz,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint task_lists_name_not_empty check (char_length(trim(name)) > 0),
  constraint task_lists_status_check check (status in ('active', 'archived'))
);

comment on table public.task_lists is
  'Per-user curated lists of today-board tasks, filtered by tags';
comment on column public.task_lists.filter_tags is
  'Tag names that select live board tasks into this list';
comment on column public.task_lists.reminder_at is
  'Optional reminder datetime for the whole list';

create index task_lists_user_deleted_idx
  on public.task_lists (user_id, deleted_at, sort_order);

create index task_lists_user_status_idx
  on public.task_lists (user_id, status)
  where deleted_at is null;

create trigger task_lists_set_updated_at
  before update on public.task_lists
  for each row execute function public.set_updated_at();

alter table public.task_lists enable row level security;

create policy "Users can view own task lists"
  on public.task_lists for select
  using (auth.uid() = user_id);

create policy "Users can insert own task lists"
  on public.task_lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own task lists"
  on public.task_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own task lists"
  on public.task_lists for delete
  using (auth.uid() = user_id);

alter publication supabase_realtime add table public.task_lists;
