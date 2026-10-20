-- Opt-in morning briefing, unfinished-task follow-up, and WhatsApp undo.
-- Proactive sends stay off until the user turns them on AND the env flag is set.

alter table public.users
  add column if not exists whatsapp_morning_briefing_enabled boolean not null default false,
  add column if not exists whatsapp_morning_briefing_hour integer not null default 7,
  add column if not exists whatsapp_morning_briefing_minute integer not null default 30,
  add column if not exists whatsapp_followup_enabled boolean not null default false,
  add column if not exists whatsapp_followup_hour integer not null default 20,
  add column if not exists whatsapp_proactive_slots text[] not null default array[]::text[],
  add column if not exists whatsapp_undo jsonb not null default '{"stack":[]}'::jsonb;

alter table public.users
  drop constraint if exists users_whatsapp_morning_briefing_hour_check;
alter table public.users
  add constraint users_whatsapp_morning_briefing_hour_check
  check (whatsapp_morning_briefing_hour between 0 and 23);

alter table public.users
  drop constraint if exists users_whatsapp_morning_briefing_minute_check;
alter table public.users
  add constraint users_whatsapp_morning_briefing_minute_check
  check (whatsapp_morning_briefing_minute between 0 and 59);

alter table public.users
  drop constraint if exists users_whatsapp_followup_hour_check;
alter table public.users
  add constraint users_whatsapp_followup_hour_check
  check (whatsapp_followup_hour between 0 and 23);

comment on column public.users.whatsapp_morning_briefing_enabled is
  'Daily WhatsApp morning briefing of today and overdue tasks. Asia/Jerusalem. Also requires WHATSAPP_MORNING_BRIEFING=true.';
comment on column public.users.whatsapp_followup_enabled is
  'Daily nudge for tasks still open. Also requires WHATSAPP_FOLLOWUP=true. Capped at 3 proactive messages per day.';
comment on column public.users.whatsapp_undo is
  'Last few WhatsApp actions (capture, complete, snooze) so «בטל» can restore them.';
