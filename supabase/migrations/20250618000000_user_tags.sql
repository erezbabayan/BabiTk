-- User-defined tags with colors for AI auto-tagging and UI filters

create table public.user_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint user_tags_name_not_empty check (char_length(trim(name)) > 0),
  unique (user_id, name)
);

create index user_tags_user_id_sort_idx
  on public.user_tags (user_id, sort_order, name);

alter table public.user_tags enable row level security;

create policy "Users can view own tags"
  on public.user_tags for select
  using (auth.uid() = user_id);

create policy "Users can insert own tags"
  on public.user_tags for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tags"
  on public.user_tags for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own tags"
  on public.user_tags for delete
  using (auth.uid() = user_id);

comment on table public.user_tags is
  'Per-user tag definitions with colors — used by AI parse and filter UI';
