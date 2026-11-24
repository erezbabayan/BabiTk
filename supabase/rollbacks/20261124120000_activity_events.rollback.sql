-- Rollback for 20261124120000_activity_events.sql. Writers are best-effort, so
-- dropping the table only makes their background inserts fail silently.
drop table if exists public.activity_events;
