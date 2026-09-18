-- Hide Google Calendar refresh tokens from browser/anon roles.
-- Service role (Edge Functions) can still read and write the column.

revoke select (google_refresh_token) on table public.users from anon, authenticated;
