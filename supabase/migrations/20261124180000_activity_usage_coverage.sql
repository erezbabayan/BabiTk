-- Silent BabiTk usage coverage for public.activity_events (follows #238).
--
-- Web/PWA and the APK talk to Supabase Auth, PostgREST and Edge directly, so
-- the Fastify requireAuth hook never sees sign-ins, refreshes or board writes.
-- This migration records them in the database, server side only:
--
--   login           AFTER INSERT on auth.sessions (any sign-in method)
--   session_refresh AFTER INSERT on auth.refresh_tokens (rotated token, parent set)
--                   AFTER UPDATE on auth.sessions when refreshed_at moves
--   board_write     AFTER INSERT/UPDATE statements on mindtasker_items,
--                   source_materials, user_tags, only when auth.uid() is set
--                   (a signed-in user's PostgREST / user-JWT request).
--                   Service-role cron, catch-up, reminders and calendar sync
--                   have no auth.uid() and are not counted.
--
-- Safety (login and board writes must never break):
--   * AFTER triggers, never modify the row, always return NEW / NULL.
--   * Every body runs inside BEGIN ... EXCEPTION WHEN OTHERS THEN NULL, so a
--     failed insert (even a dropped activity_events table) is swallowed in its
--     own subtransaction and the auth / board write commits as before.
--   * One INSERT ... ON CONFLICT DO NOTHING on the existing daily unique key.
--   * No Supabase Auth Hook: tokens, claims and responses are untouched.
--   * Triggers on auth.sessions / auth.refresh_tokens are allowed for the
--     postgres role on hosted Supabase (same as the existing
--     on_auth_user_created trigger). Functions live in public, SECURITY
--     DEFINER (owner postgres), search_path = ''.
--
-- Then a one-time backfill from real timestamps only (no estimates).
--
-- Rollback: supabase/rollbacks/20261124180000_activity_usage_coverage.rollback.sql

-- ---------------------------------------------------------------------------
-- Shared insert (Israel day, first time seen that day)
-- ---------------------------------------------------------------------------
create or replace function public.activity_note_tk(p_user_id uuid, p_event_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.activity_events (system, user_id, event_type, day, occurred_at)
  values ('tk', p_user_id, p_event_type, (now() at time zone 'Asia/Jerusalem')::date, now())
  on conflict on constraint activity_events_daily_key do nothing;
exception when others then
  -- Telemetry must never affect the caller.
  null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sign-in and session refresh (auth schema triggers, fail-open)
-- ---------------------------------------------------------------------------
create or replace function public.activity_on_auth_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n jsonb;
  o jsonb;
  uid text;
begin
  begin
    n := to_jsonb(new);
    uid := n ->> 'user_id';
    if uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      if tg_op = 'INSERT' then
        perform public.activity_note_tk(uid::uuid, 'login');
      elsif tg_op = 'UPDATE' then
        o := to_jsonb(old);
        if n ->> 'refreshed_at' is not null
          and (n ->> 'refreshed_at') is distinct from (o ->> 'refreshed_at') then
          perform public.activity_note_tk(uid::uuid, 'session_refresh');
        end if;
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create or replace function public.activity_on_auth_refresh_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n jsonb;
  uid text;
begin
  begin
    n := to_jsonb(new);
    uid := n ->> 'user_id';
    -- The first token of a session has no parent (that is the login above);
    -- every rotation inserts a child token.
    if coalesce(n ->> 'parent', '') <> ''
      and uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform public.activity_note_tk(uid::uuid, 'session_refresh');
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists activity_events_session_login on auth.sessions;
create trigger activity_events_session_login
  after insert on auth.sessions
  for each row execute function public.activity_on_auth_session();

drop trigger if exists activity_events_session_refresh on auth.sessions;
create trigger activity_events_session_refresh
  after update on auth.sessions
  for each row execute function public.activity_on_auth_session();

drop trigger if exists activity_events_refresh_token on auth.refresh_tokens;
create trigger activity_events_refresh_token
  after insert on auth.refresh_tokens
  for each row execute function public.activity_on_auth_refresh_token();

-- ---------------------------------------------------------------------------
-- Board writes by a signed-in user (statement level: one cheap call per statement)
-- ---------------------------------------------------------------------------
create or replace function public.activity_on_board_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  begin
    uid := auth.uid();
    if uid is not null then
      perform public.activity_note_tk(uid, 'board_write');
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists activity_events_board_write on public.mindtasker_items;
create trigger activity_events_board_write
  after insert or update on public.mindtasker_items
  for each statement execute function public.activity_on_board_write();

drop trigger if exists activity_events_board_write on public.source_materials;
create trigger activity_events_board_write
  after insert or update on public.source_materials
  for each statement execute function public.activity_on_board_write();

drop trigger if exists activity_events_board_write on public.user_tags;
create trigger activity_events_board_write
  after insert or update on public.user_tags
  for each statement execute function public.activity_on_board_write();

-- Trigger/internal helpers only: not callable through PostgREST RPC.
revoke all on function public.activity_note_tk(uuid, text) from public, anon, authenticated;
revoke all on function public.activity_on_auth_session() from public, anon, authenticated;
revoke all on function public.activity_on_auth_refresh_token() from public, anon, authenticated;
revoke all on function public.activity_on_board_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- One-time backfill: real timestamps only, Israel day, existing users only.
-- occurred_at = earliest real timestamp of that day. Rows that already exist
-- (written live since #238) are kept as they are.
-- ---------------------------------------------------------------------------
with src as (
  -- Sign-ins: first refresh token of a session, live sessions, last sign-in.
  select rt.user_id::text as uid, 'login'::text as event_type, rt.created_at::timestamptz as ts
    from auth.refresh_tokens rt
   where coalesce(rt.parent::text, '') = ''
  union all
  select s.user_id::text, 'login', s.created_at::timestamptz
    from auth.sessions s
  union all
  select u.id::text, 'login', u.last_sign_in_at::timestamptz
    from auth.users u
  union all
  -- Session refreshes: every rotated refresh token.
  select rt.user_id::text, 'session_refresh', rt.created_at::timestamptz
    from auth.refresh_tokens rt
   where coalesce(rt.parent::text, '') <> ''
  union all
  -- Captures by channel, from the original capture row.
  select sm.user_id::text,
         case
           when sm.source_type::text in ('whatsapp_text', 'whatsapp_voice') then 'whatsapp_message'
           when sm.source_type::text = 'notebook_ocr' then 'notebook_scan'
           when sm.source_type::text = 'app_voice' then 'voice_record'
           when sm.source_type::text = 'voice' then 'device_token_use'
           else 'board_write'
         end,
         sm.created_at
    from public.source_materials sm
  union all
  -- Items created on the board without a capture row.
  select i.user_id::text, 'board_write', i.created_at
    from public.mindtasker_items i
   where i.source_material_id is null
  union all
  -- Real user interaction (swipe, edit, toggle, restore) after creation.
  select i.user_id::text, 'board_write', i.last_interacted_at
    from public.mindtasker_items i
   where i.last_interacted_at > i.created_at + interval '5 seconds'
)
insert into public.activity_events (system, user_id, event_type, day, occurred_at)
select 'tk', u.id, src.event_type, (src.ts at time zone 'Asia/Jerusalem')::date, min(src.ts)
  from src
  join auth.users u on u.id::text = src.uid
 where src.ts is not null
   and src.ts <= now()
 group by u.id, src.event_type, (src.ts at time zone 'Asia/Jerusalem')::date
on conflict on constraint activity_events_daily_key do nothing;
