-- Rollback for 20261124180000_activity_usage_coverage.sql.
-- Drops the usage triggers and helpers. Backfilled / logged rows stay in
-- public.activity_events (metadata only); delete them separately if wanted:
--   delete from public.activity_events
--    where system = 'tk' and event_type in ('login', 'session_refresh', 'board_write',
--      'notebook_scan', 'voice_record', 'voice_transcribe', 'whatsapp_setup',
--      'whatsapp_phone_otp', 'babisnap_pairing', 'account_action');
drop trigger if exists activity_events_session_login on auth.sessions;
drop trigger if exists activity_events_session_refresh on auth.sessions;
drop trigger if exists activity_events_refresh_token on auth.refresh_tokens;
drop trigger if exists activity_events_board_write on public.mindtasker_items;
drop trigger if exists activity_events_board_write on public.source_materials;
drop trigger if exists activity_events_board_write on public.user_tags;
drop function if exists public.activity_on_board_write();
drop function if exists public.activity_on_auth_refresh_token();
drop function if exists public.activity_on_auth_session();
drop function if exists public.activity_note_tk(uuid, text);
