-- Structured AI analysis per item (מטרה, נתונים, משימה, דחיפות, תשובה_פורמט)
alter table public.mindtasker_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.mindtasker_items.metadata is
  'AI ingestion analysis snapshot (goal, source, data, task, urgency, formatted)';
