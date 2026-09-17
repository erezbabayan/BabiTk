-- BabiTk: apply pending live schema (idempotent, safe to re-run).
-- Paste the entire file in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ghibfuinantybqidwadj/sql/new


-- =====================================================================
-- supabase/migrations/20260916214500_task_lists.sql
-- =====================================================================

-- Curated task lists on the today board ("הרשימה").
-- Lists are tag-filtered views of live board tasks (same UX as the old Convex feature).

create table if not exists public.task_lists (
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

create index if not exists task_lists_user_deleted_idx
  on public.task_lists (user_id, deleted_at, sort_order);

create index if not exists task_lists_user_status_idx
  on public.task_lists (user_id, status)
  where deleted_at is null;

drop trigger if exists task_lists_set_updated_at on public.task_lists;
DO $$
BEGIN
  CREATE TRIGGER task_lists_set_updated_at
    BEFORE UPDATE ON public.task_lists
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION
  WHEN undefined_function THEN
    NULL;
END $$;

alter table public.task_lists enable row level security;

drop policy if exists "Users can view own task lists" on public.task_lists;
create policy "Users can view own task lists"
  on public.task_lists for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own task lists" on public.task_lists;
create policy "Users can insert own task lists"
  on public.task_lists for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own task lists" on public.task_lists;
create policy "Users can update own task lists"
  on public.task_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own task lists" on public.task_lists;
create policy "Users can delete own task lists"
  on public.task_lists for delete
  using (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_lists;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;


-- =====================================================================
-- supabase/migrations/20260916220000_grant_owner_premium.sql
-- =====================================================================

-- Grant Premium to the project owner (ארז בביאן / erezbabayan@gmail.com).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_username text;
  assigned_tier public.user_tier;
begin
  meta_username := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  assigned_tier := case
    when lower(coalesce(new.email, '')) = 'erezbabayan@gmail.com' then 'premium'::public.user_tier
    when lower(coalesce(meta_username, '')) in ('erezbababan', 'erezbabayan') then 'premium'::public.user_tier
    else 'free'::public.user_tier
  end;

  insert into public.users (id, email, username, tier)
  values (new.id, new.email, meta_username, assigned_tier)
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(public.users.username, excluded.username),
        tier = case
          when excluded.tier = 'premium' then 'premium'::public.user_tier
          else public.users.tier
        end;
  return new;
end;
$$;

update public.users
set tier = 'premium'
where lower(email) = 'erezbabayan@gmail.com'
   or lower(username) in ('erezbababan', 'erezbabayan');


-- =====================================================================
-- supabase/migrations/20260917050000_app_voice_and_audio_mime.sql
-- =====================================================================

-- In-app microphone recordings (web/mobile) as a first-class source channel.
alter type public.source_type add value if not exists 'app_voice';

-- Browsers record webm/ogg/wav; Expo records m4a/aac.
update storage.buckets
set allowed_mime_types = array[
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/x-m4a',
  'audio/3gpp',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id = 'source-materials';


-- =====================================================================
-- supabase/migrations/20260917120000_notify_whatsapp_group.sql
-- =====================================================================

-- Opt-in: send due reminders as WhatsApp messages to the configured capture group.
alter table public.users
  add column if not exists notify_whatsapp_group boolean not null default false;

comment on column public.users.notify_whatsapp_group is
  'When true, due item/list reminders are sent to the configured WhatsApp capture group';


-- =====================================================================
-- supabase/migrations/20260917140000_whatsapp_digest_slots.sql
-- =====================================================================

-- Slot keys "YYYY-MM-DD:H" so each configured digest hour sends once per day.
alter table public.users
  add column if not exists whatsapp_digest_slots text[] not null default array[]::text[];

comment on column public.users.whatsapp_digest_slots is
  'WhatsApp digest hours already sent, as YYYY-MM-DD:H in Asia/Jerusalem';


-- =====================================================================
-- supabase/migrations/20260917180000_whatsapp_group_reminders_backfill.sql
-- =====================================================================

-- Connected WhatsApp groups should receive item/note reminders.
-- The leftover notify_whatsapp_group default (false) blocked every send.
alter table public.users
  alter column notify_whatsapp_group set default true;

update public.users
set notify_whatsapp_group = true
where coalesce(whatsapp_capture_group_chat_id, '') ilike '%@g.us';

comment on column public.users.notify_whatsapp_group is
  'When a capture group (@g.us) is connected, due item/note reminders are sent there. This flag stays on after bind so settings match delivery.';


-- =====================================================================
-- supabase/migrations/20260917200000_product_gaps.sql
-- =====================================================================

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



-- =====================================================================
-- supabase/migrations/20260917210000_notifications_insert.sql
-- =====================================================================

-- Allow the signed-in user to insert their own in-app notifications
-- (client-side due-date reminders + push registration side effects).

drop policy if exists "Users can insert own notifications" on public.user_notifications;
create policy "Users can insert own notifications"
  on public.user_notifications for insert
  with check (auth.uid() = user_id);

