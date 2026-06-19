-- MindTasker — initial database schema
-- Tasks + Notes (unified items table), source materials, RLS, Realtime, pgvector

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_tier as enum ('free', 'premium');

create type public.item_status as enum (
  'inbox',
  'pending',
  'completed',
  'snoozed_archive'
);

create type public.source_type as enum (
  'whatsapp_voice',
  'whatsapp_text',
  'notebook_ocr'
);

-- ---------------------------------------------------------------------------
-- users (profile + usage metering, linked to Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  phone text unique,
  phone_verified boolean not null default false,
  tier public.user_tier not null default 'free',
  allocated_audio_seconds integer not null default 1800 check (allocated_audio_seconds >= 0),
  used_audio_seconds integer not null default 0 check (used_audio_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'MindTasker user profile and AI usage quotas';
comment on column public.users.phone is 'WhatsApp phone number (E.164), used for inbound message routing';
comment on column public.users.allocated_audio_seconds is 'Monthly Whisper quota in seconds (free tier default: 30 min)';

-- ---------------------------------------------------------------------------
-- source_materials (raw audio, images, transcripts — shared across split items)
-- ---------------------------------------------------------------------------
create table public.source_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  source_type public.source_type not null,
  storage_url text,
  raw_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.source_materials is 'Original capture artifacts (voice, OCR image, WhatsApp text)';
comment on column public.source_materials.storage_url is 'Supabase Storage path or signed URL for media';
comment on column public.source_materials.raw_text is 'Unprocessed transcript or OCR output before AI cleanup';

-- ---------------------------------------------------------------------------
-- mindtasker_items (tasks + notes in one table, separated by is_actionable)
-- ---------------------------------------------------------------------------
create table public.mindtasker_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  source_material_id uuid references public.source_materials (id) on delete set null,

  title text not null,
  content text not null default '',
  is_actionable boolean not null default true,

  -- Task lifecycle (notes typically stay in pending or a dedicated flow)
  status public.item_status not null default 'inbox',
  due_date timestamptz,
  completed_at timestamptz,
  calendar_event_id text,

  tags text[] not null default '{}',
  embedding vector(1536),

  -- Inbox auto-archive: track last user interaction (swipe, edit, toggle)
  last_interacted_at timestamptz not null default now(),

  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mindtasker_items_title_not_empty check (char_length(trim(title)) > 0),
  constraint mindtasker_items_completed_at_when_done check (
    status <> 'completed' or completed_at is not null
  )
);

comment on table public.mindtasker_items is 'Unified tasks (is_actionable=true) and notes (is_actionable=false)';
comment on column public.mindtasker_items.is_actionable is 'true = Task (action required), false = Note (reference/knowledge)';
comment on column public.mindtasker_items.status is 'inbox = awaiting triage; pending = active; completed; snoozed_archive = auto-archived from inbox';
comment on column public.mindtasker_items.embedding is 'OpenAI text-embedding-3-small vector for semantic note search';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index users_phone_idx on public.users (phone) where phone is not null;

create index source_materials_user_id_idx on public.source_materials (user_id);
create index source_materials_user_created_idx on public.source_materials (user_id, created_at desc);

create index mindtasker_items_user_id_idx on public.mindtasker_items (user_id);
create index mindtasker_items_user_status_idx on public.mindtasker_items (user_id, status)
  where deleted_at is null;
create index mindtasker_items_user_inbox_idx on public.mindtasker_items (user_id, last_interacted_at)
  where status = 'inbox' and deleted_at is null;
create index mindtasker_items_user_pending_tasks_idx on public.mindtasker_items (user_id, due_date)
  where is_actionable = true and status = 'pending' and deleted_at is null;
create index mindtasker_items_user_notes_idx on public.mindtasker_items (user_id, created_at desc)
  where is_actionable = false and deleted_at is null;
create index mindtasker_items_tags_gin_idx on public.mindtasker_items using gin (tags);
create index mindtasker_items_source_material_idx on public.mindtasker_items (source_material_id)
  where source_material_id is not null;

-- Semantic search (notes only)
create index mindtasker_items_embedding_hnsw_idx
  on public.mindtasker_items
  using hnsw (embedding vector_cosine_ops)
  where is_actionable = false and deleted_at is null and embedding is not null;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger mindtasker_items_set_updated_at
  before update on public.mindtasker_items
  for each row execute function public.set_updated_at();

-- Auto-set completed_at when status changes to completed
create or replace function public.sync_item_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    new.completed_at = coalesce(new.completed_at, now());
  elsif new.status <> 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger mindtasker_items_sync_completed_at
  before insert or update of status on public.mindtasker_items
  for each row execute function public.sync_item_completed_at();

-- Create public.users row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.source_materials enable row level security;
alter table public.mindtasker_items enable row level security;

-- users
create policy "Users can view own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- source_materials
create policy "Users can view own source materials"
  on public.source_materials for select
  using (auth.uid() = user_id);

create policy "Users can insert own source materials"
  on public.source_materials for insert
  with check (auth.uid() = user_id);

create policy "Users can update own source materials"
  on public.source_materials for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own source materials"
  on public.source_materials for delete
  using (auth.uid() = user_id);

-- mindtasker_items
create policy "Users can view own items"
  on public.mindtasker_items for select
  using (auth.uid() = user_id and deleted_at is null);

create policy "Users can insert own items"
  on public.mindtasker_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own items"
  on public.mindtasker_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own items"
  on public.mindtasker_items for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime (push item changes to Web + Mobile)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.mindtasker_items;

-- ---------------------------------------------------------------------------
-- Semantic search helper (cosine similarity over note embeddings)
-- ---------------------------------------------------------------------------
create or replace function public.search_notes(
  query_embedding vector(1536),
  match_count integer default 10,
  match_threshold float default 0.5
)
returns table (
  id uuid,
  title text,
  content text,
  tags text[],
  similarity float
)
language sql
stable
security invoker
as $$
  select
    i.id,
    i.title,
    i.content,
    i.tags,
    1 - (i.embedding <=> query_embedding) as similarity
  from public.mindtasker_items i
  where i.user_id = auth.uid()
    and i.is_actionable = false
    and i.deleted_at is null
    and i.embedding is not null
    and 1 - (i.embedding <=> query_embedding) > match_threshold
  order by i.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.search_notes is 'Semantic search over notes using cosine similarity (pgvector)';
