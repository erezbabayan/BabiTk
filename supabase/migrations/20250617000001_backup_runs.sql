-- MindTasker — backup run audit log (written by backend service role)

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('scheduled', 'manual')),
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  archive_path text,
  manifest jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.backup_runs is 'Full-system backup execution history (DB + storage)';

create index backup_runs_started_at_idx on public.backup_runs (started_at desc);

alter table public.backup_runs enable row level security;
