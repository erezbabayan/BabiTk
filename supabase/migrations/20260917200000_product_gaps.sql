-- Product gaps: notifications, ingest lessons, WhatsApp session, push tokens

alter table public.users
  add column if not exists notify_in_app boolean not null default true,
  add column if not exists notify_browser boolean not null default false,
  add column if not exists notify_whatsapp boolean not null default true,
  add column if not exists notify_whatsapp_group boolean not null default false,
  add column if not exists notify_overdue_reminders boolean not null default true,
  add column if not exists overdue_first_hours integer not null default 24,
  add column if not exists overdue_repeat_hours integer not null default 24,
  add column if not exists whatsapp_last_item_ids uuid[] not null default '{}'::uuid[],
  add column if not exists whatsapp_last_digest_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.users.notify_in_app is 'Show in-app reminder bell and popup';
comment on column public.users.notify_whatsapp is 'Send due reminders and digests to the linked WhatsApp number';
comment on column public.users.whatsapp_last_item_ids is 'Most recent WhatsApp-captured item ids for numbered reply commands';
comment on column public.users.whatsapp_last_digest_at is 'Last successful WhatsApp digest send';

-- ---------------------------------------------------------------------------
-- Ingest lessons (user corrections → better future parses)
-- ---------------------------------------------------------------------------
create table if not exists public.user_ingest_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('tag_remap', 'topic_tag', 'prefer_split', 'prefer_merge')),
  cue_text text not null,
  from_value text,
  to_value text not null,
  weight integer not null default 1 check (weight >= 1),
  source_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_ingest_lessons_user_idx
  on public.user_ingest_lessons (user_id, updated_at desc);
create index if not exists user_ingest_lessons_user_cue_idx
  on public.user_ingest_lessons (user_id, cue_text);

alter table public.user_ingest_lessons enable row level security;

drop policy if exists "Users can view own ingest lessons" on public.user_ingest_lessons;
create policy "Users can view own ingest lessons"
  on public.user_ingest_lessons for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own ingest lessons" on public.user_ingest_lessons;
create policy "Users can insert own ingest lessons"
  on public.user_ingest_lessons for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own ingest lessons" on public.user_ingest_lessons;
create policy "Users can update own ingest lessons"
  on public.user_ingest_lessons for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ingest lessons" on public.user_ingest_lessons;
create policy "Users can delete own ingest lessons"
  on public.user_ingest_lessons for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Expo / web push tokens
-- ---------------------------------------------------------------------------
create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists user_push_tokens_user_idx
  on public.user_push_tokens (user_id);

alter table public.user_push_tokens enable row level security;

drop policy if exists "Users can view own push tokens" on public.user_push_tokens;
create policy "Users can view own push tokens"
  on public.user_push_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own push tokens" on public.user_push_tokens;
create policy "Users can insert own push tokens"
  on public.user_push_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own push tokens" on public.user_push_tokens;
create policy "Users can update own push tokens"
  on public.user_push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own push tokens" on public.user_push_tokens;
create policy "Users can delete own push tokens"
  on public.user_push_tokens for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- In-app notification center (Supabase path)
-- ---------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  item_id uuid references public.mindtasker_items (id) on delete set null,
  read boolean not null default false,
  fire_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_fire_idx
  on public.user_notifications (user_id, fire_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "Users can view own notifications" on public.user_notifications;
create policy "Users can view own notifications"
  on public.user_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.user_notifications;
create policy "Users can update own notifications"
  on public.user_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own notifications" on public.user_notifications;
create policy "Users can delete own notifications"
  on public.user_notifications for delete
  using (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

