# MindTasker

Zero-friction task & note ingestion (WhatsApp, voice, notebook OCR) with AI classification.

## Quick start (local)

```powershell
.\scripts\run-dev.ps1
# Web: http://localhost:5173
# API: http://localhost:3001/health
```

Demo mode is enabled when `web/.env` has `VITE_DEMO_MODE=true` (default for local dev without Supabase).

## Supabase setup

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:SUPABASE_DB_PASSWORD = "..."
$env:SUPABASE_CREATE = "1"   # or set SUPABASE_PROJECT_REF for existing project
.\scripts\setup-supabase.ps1
node scripts\check-env.mjs
node scripts\verify-stack.mjs
```

## Production

See [DEPLOYMENT.md](./DEPLOYMENT.md) and [deploy/nginx-ssl.conf.example](./deploy/nginx-ssl.conf.example).

```bash
cp .env.production.example .env.production
docker compose up -d --build
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/run-dev.ps1` | Start backend + web |
| `scripts/setup-supabase.ps1` | Link/create Supabase + migrations + .env |
| `scripts/verify-stack.mjs` | Smoke check all 6 stages |
| `scripts/check-env.mjs` | Validate .env files |
| `scripts/check-integrations.mjs` | Stripe/WhatsApp/Google checklist |

## Mobile

```powershell
cd mobile
copy .env.example .env
# EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL
npm install
npm run android
npx eas build --profile production
```
