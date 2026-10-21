-- Weekly summary opt-in, Shabbat quiet hours, habit memory, and a pending task breakdown.
-- Missing this migration must not be required for ordinary capture: callers treat a
-- missing column as "feature unavailable" and keep saving the message.

alter table public.users
  add column if not exists whatsapp_weekly_summary_enabled boolean not null default false,
  add column if not exists whatsapp_shabbat_mode_enabled boolean not null default true,
  add column if not exists whatsapp_habits jsonb not null default '{}'::jsonb,
  add column if not exists whatsapp_pending_breakdown jsonb;

comment on column public.users.whatsapp_weekly_summary_enabled is
  'Friday 13:00 Asia/Jerusalem weekly summary. Also requires WHATSAPP_WEEKLY_SUMMARY (default on) and counts toward the 3 proactive messages a day.';
comment on column public.users.whatsapp_shabbat_mode_enabled is
  'When true, proactive WhatsApp and reminders wait from Friday candle-lighting until Saturday havdalah (Jerusalem).';
comment on column public.users.whatsapp_habits is
  'Counts of chosen morning hours, shopping weekdays, and categories. Applied only after two samples.';
comment on column public.users.whatsapp_pending_breakdown is
  'Proposed subtasks waiting for «כן» before any card is saved.';
