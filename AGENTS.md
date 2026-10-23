# BabiTk: notes for coding agents

Hebrew-first task/notebook app: capture via WhatsApp (Green-API), BabiSnap/voice devices, web and Android.

## Live stack (verified 2026-10-23)
- **Supabase** (project `ghibfuinantybqidwadj`): Postgres + Auth + Storage + Edge Functions.
  - Functions: `supabase/functions/<name>/index.ts`, shared code in `supabase/functions/_shared/`.
  - Key functions: `whatsapp-green-webhook` (WhatsApp ingest), `transcribe-voice-item`, `voice-ingest`/`ingest-voice`, `ingest-notebook` (OCR), `whatsapp-send-reminders`, `babisnap`, `account`, `google-login`.
  - Schema changes: `supabase/migrations/*.sql`.
- **Web**: `web/src` (React + Vite + Tailwind), deployed to GitHub Pages (https://erezbabayan.github.io/BabiTk/) from the build artifact `web/dist`. `web/assets/` is old committed build output and is not served.
- **Mobile**: `mobile/` (Expo / React Native), APK built by `.github/workflows/android-release.yml` on every push to main (versionCode = run number, latest at `releases/latest/download/BabiTk.apk`).
- **Convex**: the runtime is retired (`useConvexBackend()` returns false; no deployment). The `convex/lib/**` source is still live shared code: edge functions import `convex/lib/ingest/*`, and web/mobile import shared helpers. Do not delete it.
- **backend/** (Fastify): not deployed (the SSH deploy is skipped, no API URL in the builds). It hosts the main Node test suite (`backend/src/tests`).

## Test before every PR (same as CI)
```bash
npm ci                                   # root (Convex shared deps)
cd backend && npm ci && npm run typecheck && OPENAI_API_KEY=sk-test npm test
cd web && npm ci && npm test && npm run build
cd mobile && npm ci && npm test          # tsc + unit tests
node scripts/verify-stack.mjs
```
Edge functions: `deno check supabase/functions/<name>/index.ts`.

## Deploy
- PR → `verify` must pass → squash-merge to main.
- On merge: Deploy Web (Pages), Android release, and Deploy Supabase Functions (only when `supabase/functions/**` or `convex/lib/ingest/**` change; it runs `supabase db push` and then the function deploys).
- A PR with only a migration does not trigger the Supabase deploy.

## Hebrew / RTL
- The UI is Hebrew and RTL (`<html dir="rtl">`). Use logical spacing (`ms-`/`me-`, `start`/`end`) and test truncation with Hebrew text.
- Keep Hebrew user-facing strings in Hebrew. Icon-only buttons need a Hebrew `aria-label` (web) or `accessibilityLabel` (mobile).
- Phone widths of 360–412px must fit the header in one row.

## Rules
- Never print, log or commit secrets (tokens, API keys, service-role keys). Use env vars and secrets.
- Free services only. Do not route to paid APIs (e.g. gpt-4o) without explicit approval.
- Do not break WhatsApp ingest, BabiSnap/device tokens, voice upload, login or cron jobs.
