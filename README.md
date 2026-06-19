# MindTasker

מערכת לקליטה חכמה של משימות והערות — מוואטסאפ (טקסט, קול), מסרים, וסריקת מחברת — עם סיווג AI, לוח עמודות, ותזכורות.

## יכולות עיקריות

- **קליטה** — וואטסאפ, הקלטה קולית, OCR למחברת, הקלדה מהירה
- **AI** — פירוק טקסט בעברית, דחיפות, תאריכים יחסיים («מחר ב-10»), תגיות
- **לוח** — Inbox, משימות, הערות, ארכיון, חיפוש סמנטי
- **אינטגרציות** — Supabase, Stripe Premium, Google Calendar, Convex (WhatsApp pipeline)
- **פריסה** — Docker Compose, CI/CD ב-GitHub Actions, deploy אוטומטי לשרת

## התחלה מהירה (מקומי)

```powershell
.\scripts\install-git-hooks.ps1   # פעם אחת — תזכורת לפני commit
.\scripts\run-dev.ps1
# Web: http://localhost:5173
# API: http://localhost:3001/health
```

מצב Demo פעיל כש-`web/.env` מכיל `VITE_DEMO_MODE=true` (ברירת מחדל לפיתוח בלי Supabase).

## Supabase

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:SUPABASE_DB_PASSWORD = "..."
$env:SUPABASE_CREATE = "1"   # או SUPABASE_PROJECT_REF לפרויקט קיים
.\scripts\setup-supabase.ps1
node scripts\check-env.mjs
node scripts\verify-stack.mjs
```

## פרודקשן

ראה [DEPLOYMENT.md](./DEPLOYMENT.md) ו-[deploy/nginx-ssl.conf.example](./deploy/nginx-ssl.conf.example).

```bash
cp .env.production.example .env.production
docker compose up -d --build
```

אחרי הגדרת secrets ב-GitHub (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_PATH`) — כל push מוצלח ל-`main` מפריס אוטומטית לשרת.

## סקריפטים

| סקריפט | תפקיד |
|--------|--------|
| `scripts/run-dev.ps1` | הפעלת backend + web |
| `scripts/setup-supabase.ps1` | חיבור/יצירת Supabase + migrations + .env |
| `scripts/connect-github.ps1` | חיבור ראשוני ל-GitHub |
| `scripts/install-git-hooks.ps1` | התקנת Git hooks (תזכורת + חסימת .env) |
| `scripts/verify-stack.mjs` | בדיקת עשן לכל 6 השלבים |
| `scripts/check-env.mjs` | אימות קבצי .env |
| `scripts/check-integrations.mjs` | צ'קליסט Stripe / WhatsApp / Google |

## מובייל

```powershell
cd mobile
copy .env.example .env
# EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL
npm install
npm run android
npx eas build --profile production
```

## מבנה הפרויקט

```
backend/   — API (Fastify), WhatsApp, AI, Stripe, גיבויים
web/       — ממשק React (Vite)
mobile/    — אפליקציית Expo / React Native
convex/    — pipeline לוואטסאפ ו-OCR
supabase/  — migrations, RLS, pgvector
```

## רישיון

פרויקט פרטי — כל הזכויות שמורות.
