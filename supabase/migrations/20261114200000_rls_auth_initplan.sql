-- Performance: Supabase advisor `auth_rls_initplan` (40 policies).
-- Wrap auth.uid() in a scalar sub-select so Postgres evaluates it once per
-- query (InitPlan) instead of once per row. Semantics are IDENTICAL:
-- ALTER POLICY only changes USING / WITH CHECK; roles, command and
-- permissive mode are untouched. No drop/create window.
-- Generated from production pg_policies on 2026-11-14 (not hand-typed).
--
-- Rollback: re-run the original expressions listed at the bottom of this file
-- (commented out).

alter policy device_tokens_insert_babisnap on public.device_tokens
  with check (((user_id = (select auth.uid())) AND (name = 'BabiSnap'::text)));
alter policy device_tokens_revoke_babisnap on public.device_tokens
  using (((user_id = (select auth.uid())) AND (name = 'BabiSnap'::text) AND (revoked_at IS NULL)))
  with check (((user_id = (select auth.uid())) AND (name = 'BabiSnap'::text)));
alter policy device_tokens_select_own on public.device_tokens
  using ((user_id = (select auth.uid())));
alter policy "Users can delete own items" on public.mindtasker_items
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own items" on public.mindtasker_items
  with check (((select auth.uid()) = user_id));
alter policy "Users can update own items" on public.mindtasker_items
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "Users can view own items" on public.mindtasker_items
  using ((((select auth.uid()) = user_id) AND (deleted_at IS NULL)));
alter policy "Users can view own trash items" on public.mindtasker_items
  using ((((select auth.uid()) = user_id) AND (deleted_at IS NOT NULL) AND (deleted_at > (now() - '30 days'::interval))));
alter policy "Users can delete own source materials" on public.source_materials
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own source materials" on public.source_materials
  with check (((select auth.uid()) = user_id));
alter policy "Users can update own source materials" on public.source_materials
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "Users can view own source materials" on public.source_materials
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own task lists" on public.task_lists
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own task lists" on public.task_lists
  with check (((select auth.uid()) = user_id));
alter policy "Users can update own task lists" on public.task_lists
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "Users can view own task lists" on public.task_lists
  using (((select auth.uid()) = user_id));
alter policy "Users can view own usage events" on public.usage_events
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own ingest lessons" on public.user_ingest_lessons
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own ingest lessons" on public.user_ingest_lessons
  with check (((select auth.uid()) = user_id));
alter policy "Users can update own ingest lessons" on public.user_ingest_lessons
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "Users can view own ingest lessons" on public.user_ingest_lessons
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own notifications" on public.user_notifications
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own notifications" on public.user_notifications
  with check (((select auth.uid()) = user_id));
alter policy "Users can update own notifications" on public.user_notifications
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "Users can view own notifications" on public.user_notifications
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own push tokens" on public.user_push_tokens
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own push tokens" on public.user_push_tokens
  with check (((select auth.uid()) = user_id));
alter policy "Users can update own push tokens" on public.user_push_tokens
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "Users can view own push tokens" on public.user_push_tokens
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own tags" on public.user_tags
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own tags" on public.user_tags
  with check (((select auth.uid()) = user_id));
alter policy "Users can update own tags" on public.user_tags
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "Users can view own tags" on public.user_tags
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own profile" on public.users
  with check ((((select auth.uid()) = id) AND (tier = 'free'::user_tier)));
alter policy "Users can update own profile" on public.users
  using (((select auth.uid()) = id))
  with check (((select auth.uid()) = id));
alter policy "Users can view own profile" on public.users
  using (((select auth.uid()) = id));
alter policy whatsapp_gateways_delete_own on public.whatsapp_gateways
  using (((select auth.uid()) = user_id));
alter policy whatsapp_gateways_insert_own on public.whatsapp_gateways
  with check (((select auth.uid()) = user_id));
alter policy whatsapp_gateways_select_own on public.whatsapp_gateways
  using (((select auth.uid()) = user_id));
alter policy whatsapp_gateways_update_own on public.whatsapp_gateways
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

-- ===== ROLLBACK (original expressions) =====
-- alter policy device_tokens_insert_babisnap on public.device_tokens
--   with check (((user_id = auth.uid()) AND (name = 'BabiSnap'::text)));
-- alter policy device_tokens_revoke_babisnap on public.device_tokens
--   using (((user_id = auth.uid()) AND (name = 'BabiSnap'::text) AND (revoked_at IS NULL)))
--   with check (((user_id = auth.uid()) AND (name = 'BabiSnap'::text)));
-- alter policy device_tokens_select_own on public.device_tokens
--   using ((user_id = auth.uid()));
-- alter policy "Users can delete own items" on public.mindtasker_items
--   using ((auth.uid() = user_id));
-- alter policy "Users can insert own items" on public.mindtasker_items
--   with check ((auth.uid() = user_id));
-- alter policy "Users can update own items" on public.mindtasker_items
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
-- alter policy "Users can view own items" on public.mindtasker_items
--   using (((auth.uid() = user_id) AND (deleted_at IS NULL)));
-- alter policy "Users can view own trash items" on public.mindtasker_items
--   using (((auth.uid() = user_id) AND (deleted_at IS NOT NULL) AND (deleted_at > (now() - '30 days'::interval))));
-- alter policy "Users can delete own source materials" on public.source_materials
--   using ((auth.uid() = user_id));
-- alter policy "Users can insert own source materials" on public.source_materials
--   with check ((auth.uid() = user_id));
-- alter policy "Users can update own source materials" on public.source_materials
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
-- alter policy "Users can view own source materials" on public.source_materials
--   using ((auth.uid() = user_id));
-- alter policy "Users can delete own task lists" on public.task_lists
--   using ((auth.uid() = user_id));
-- alter policy "Users can insert own task lists" on public.task_lists
--   with check ((auth.uid() = user_id));
-- alter policy "Users can update own task lists" on public.task_lists
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
-- alter policy "Users can view own task lists" on public.task_lists
--   using ((auth.uid() = user_id));
-- alter policy "Users can view own usage events" on public.usage_events
--   using ((auth.uid() = user_id));
-- alter policy "Users can delete own ingest lessons" on public.user_ingest_lessons
--   using ((auth.uid() = user_id));
-- alter policy "Users can insert own ingest lessons" on public.user_ingest_lessons
--   with check ((auth.uid() = user_id));
-- alter policy "Users can update own ingest lessons" on public.user_ingest_lessons
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
-- alter policy "Users can view own ingest lessons" on public.user_ingest_lessons
--   using ((auth.uid() = user_id));
-- alter policy "Users can delete own notifications" on public.user_notifications
--   using ((auth.uid() = user_id));
-- alter policy "Users can insert own notifications" on public.user_notifications
--   with check ((auth.uid() = user_id));
-- alter policy "Users can update own notifications" on public.user_notifications
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
-- alter policy "Users can view own notifications" on public.user_notifications
--   using ((auth.uid() = user_id));
-- alter policy "Users can delete own push tokens" on public.user_push_tokens
--   using ((auth.uid() = user_id));
-- alter policy "Users can insert own push tokens" on public.user_push_tokens
--   with check ((auth.uid() = user_id));
-- alter policy "Users can update own push tokens" on public.user_push_tokens
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
-- alter policy "Users can view own push tokens" on public.user_push_tokens
--   using ((auth.uid() = user_id));
-- alter policy "Users can delete own tags" on public.user_tags
--   using ((auth.uid() = user_id));
-- alter policy "Users can insert own tags" on public.user_tags
--   with check ((auth.uid() = user_id));
-- alter policy "Users can update own tags" on public.user_tags
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
-- alter policy "Users can view own tags" on public.user_tags
--   using ((auth.uid() = user_id));
-- alter policy "Users can insert own profile" on public.users
--   with check (((auth.uid() = id) AND (tier = 'free'::user_tier)));
-- alter policy "Users can update own profile" on public.users
--   using ((auth.uid() = id))
--   with check ((auth.uid() = id));
-- alter policy "Users can view own profile" on public.users
--   using ((auth.uid() = id));
-- alter policy whatsapp_gateways_delete_own on public.whatsapp_gateways
--   using ((auth.uid() = user_id));
-- alter policy whatsapp_gateways_insert_own on public.whatsapp_gateways
--   with check ((auth.uid() = user_id));
-- alter policy whatsapp_gateways_select_own on public.whatsapp_gateways
--   using ((auth.uid() = user_id));
-- alter policy whatsapp_gateways_update_own on public.whatsapp_gateways
--   using ((auth.uid() = user_id))
--   with check ((auth.uid() = user_id));
