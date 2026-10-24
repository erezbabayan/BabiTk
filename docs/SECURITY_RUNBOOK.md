# Security incident runbook (BabiTk)

Short, practical steps for when something looks wrong. Production = Supabase project `ghibfuinantybqidwadj` (eu-west-1), web on GitHub Pages, edge functions on Supabase, Android APK via GitHub Releases.

## 0. Triage (first 15 minutes)
1. Write down what you saw, when (Asia/Jerusalem time) and where (screenshot / log link).
2. Classify:
   - **Leaked secret** (key in a commit, log, chat, screenshot) → section 1.
   - **Suspicious data access / account takeover** → section 2.
   - **Data loss / corruption** → section 3.
   - **Compromised dependency or GitHub Action** → section 4.
3. Do not delete evidence (logs, rows, commits) before copying it.

## 1. Leaked secret
Public by design (NOT an incident): Supabase anon key (in web/mobile bundles, workflows, `mobile/app.json`). Everything else is secret.

| Secret | Where it lives | Rotate at |
|---|---|---|
| Supabase service_role / JWT secret | Supabase dashboard → Settings → API; edge-function env; GitHub secret `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → API keys (rotating the JWT secret also changes the anon key → rebuild web + mobile) |
| Supabase access token (`sbp_…`) | GitHub secret `SUPABASE_ACCESS_TOKEN`, automation env | supabase.com/dashboard/account/tokens |
| DB password | GitHub secret `SUPABASE_DB_PASSWORD` (backups) | Dashboard → Database → Reset password |
| OpenAI key | Supabase function secrets | platform.openai.com/api-keys |
| Google OAuth client secret | Supabase function secrets / Auth provider | Google Cloud Console → Credentials |
| WhatsApp (Green API) tokens, webhook token | Supabase function secrets / `whatsapp_gateways` | Green API console |
| Cron secrets (`GROUP_CATCHUP_CRON_SECRET`, etc.) | Supabase secrets + GitHub secrets + DB settings used by pg_cron | regenerate random value, update all 3 places |
| Android keystore | GitHub secrets `ANDROID_*` | cannot rotate without Play app signing support — protect, don't leak |
| GitHub PATs | GitHub → Settings → Developer settings | revoke + recreate |

Steps: (1) rotate at the source, (2) update every place in the table, (3) redeploy edge functions (`Deploy Supabase Functions` workflow → Run) and web if needed, (4) check the flows in section 5, (5) the old value stays in git history — treat it as burned; history rewrite is optional and only after rotation.

Scanning: the `gitleaks` workflow runs on every push/PR. Full-history manual scan: `gitleaks git . --redact` and `trufflehog git file://. --only-verified`.

## 2. Suspicious access / account takeover
1. Supabase dashboard → Authentication → Users: find the user, **sign out all sessions** / ban if needed.
2. Logs: Dashboard → Logs (API, Auth, Postgres, Edge Functions). Filter by user id / IP.
3. Check RLS is on for all tables:
   `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;` (should be empty or intentional).
4. Check which SECURITY DEFINER functions anon can execute:
   `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosecdef and has_function_privilege('anon',p.oid,'EXECUTE');` (expected: `resolve_login_email` only).
5. If a key was used, go to section 1.

## 3. Data loss / restore
- Supabase daily backups (plan-dependent) → Dashboard → Database → Backups.
- Monthly encrypted dump: workflow `Monthly encrypted DB backup` (artifact `babitk-db-<date>`, 90 days). Needs secrets `SUPABASE_DB_PASSWORD` + `BACKUP_PASSPHRASE`; schedule is commented out until they exist.
- Restore a dump (into a NEW/staging project first, never straight over prod):
  ```bash
  gpg --decrypt babitk-db-XXXX.dump.gpg > db.dump      # asks for BACKUP_PASSPHRASE
  pg_restore --no-owner --no-privileges -d "$TARGET_DB_URL" --schema=public db.dump
  ```
  Verify row counts, then copy only the needed rows back to prod.
- Migrations are NOT applied by deploy; they are applied via the Management API / SQL editor. Every DB security change ships with a rollback file under `supabase/rollbacks/`.

## 4. Compromised dependency / Action
1. Actions are pinned to commit SHAs; Dependabot (monthly) proposes updates — review the diff before merging.
2. If an advisory hits: `npm audit` in `/`, `backend`, `web`, `mobile`; apply `npm audit fix` (never `--force` without testing); CI must pass.
3. If a workflow may have leaked secrets, rotate everything that workflow could read (section 1).

## 5. Post-incident verification checklist
- Login (email/username lookup, Google login, phone OTP) on web and mobile.
- Search on web board.
- WhatsApp ingest (send a message) and reminders (`cron.job_run_details` shows recent `succeeded` for `babitk-whatsapp-reminders` / `babitk-whatsapp-group-catchup`).
- Voice ingest, calendar sync, BabiSnap queue.
- `Deploy Web` and `Deploy Supabase Functions` workflows green.

## 6. After
Write a short note in `docs/` (what, when, impact, fix, follow-ups). Rotate anything you are unsure about.
