-- Usage metering & monthly reset for Freemium paywall

alter table public.users
  add column if not exists allocated_ai_parses integer not null default 50
    check (allocated_ai_parses >= 0),
  add column if not exists used_ai_parses integer not null default 0
    check (used_ai_parses >= 0),
  add column if not exists usage_period_start timestamptz not null default now();

comment on column public.users.allocated_ai_parses is 'Monthly AI parse/OCR operations allowed on free tier';
comment on column public.users.used_ai_parses is 'AI parse/OCR operations used in current billing period';
comment on column public.users.usage_period_start is 'Start of current usage metering period (monthly reset)';

-- Audit log for usage events (optional analytics)
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  event_type text not null check (event_type in ('audio', 'ai_parse', 'ocr')),
  units integer not null default 1 check (units > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

alter table public.usage_events enable row level security;

create policy "Users can view own usage events"
  on public.usage_events for select
  using (auth.uid() = user_id);
