# Proposal (not applied): RLS `auth_rls_initplan` fix

**Status:** proposal only — needs Erez's explicit approval. No migration in this PR.

## Finding
Supabase performance advisor reports 40 `auth_rls_initplan` warnings (read-only check, 12.11.2026):
policies call `auth.uid()` directly, so Postgres re-evaluates it for **every row** instead of once per query.

Tables: `mindtasker_items` (5), `source_materials` (4), `task_lists` (4), `user_notifications` (4),
`user_push_tokens` (4), `user_tags` (4), `user_ingest_lessons` (4), `whatsapp_gateways` (4),
`users` (3), `device_tokens` (3), `usage_events` (1).

Also: 6 × `multiple_permissive_policies` on `mindtasker_items` SELECT ("view own items" + "view own trash items").

## Impact today
Small. Main board query: mean 11 ms, 88 items for the only user. This matters as data grows.

## Proposed change (one migration, same semantics)
For each policy, wrap the call in a sub-select, e.g.

```sql
alter policy "Users can view own items" on public.mindtasker_items
  using ((select auth.uid()) = user_id and deleted_at is null);
alter policy "Users can update own items" on public.mindtasker_items
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- … same pattern for the other 38 policies (exact list from pg_policies)
```

Optional, separately: merge the two `mindtasker_items` SELECT policies into one
`using ((select auth.uid()) = user_id and (deleted_at is null or deleted_at > now() - interval '30 days'))`.

## Why it is risky
RLS guards every read/write from web, Android, WhatsApp edge functions (service role bypasses RLS,
user-JWT calls do not), BabiSnap, reminders. A typo locks users out or leaks rows.

## Safe rollout
1. Generate the migration from `pg_policies` (no hand-typing), `alter policy` only — no drop/create window.
2. Test on a Supabase branch / local stack: login, board load, create/edit/delete, trash, tags,
   task lists, push token register, notifications, WhatsApp/BabiSnap ingest.
3. Apply off-peak after Erez approves; rollback migration = the original expressions (saved in the file).
