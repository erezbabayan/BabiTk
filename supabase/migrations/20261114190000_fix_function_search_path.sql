-- Security Advisor lint 0011 (function_search_path_mutable):
-- pin search_path on the three functions that still used the caller's
-- (role-mutable) search_path. Bodies are unchanged; only the function's
-- configuration is altered, so behaviour is identical.
--
-- `public` is kept on the path (repo convention, same as the other functions)
-- because search_notes uses the pgvector `<=>` operator and `vector` type,
-- which live in the public schema. pg_catalog is always searched implicitly,
-- so now()/coalesce in the trigger functions resolve exactly as before.

alter function public.set_updated_at() set search_path = public;
alter function public.sync_item_completed_at() set search_path = public;
alter function public.search_notes(vector, integer, double precision) set search_path = public;
