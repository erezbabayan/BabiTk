# Production Deployment

## Prerequisites

- Docker & Docker Compose
- Supabase project with all migrations applied (`supabase db push`)
- Domain + TLS terminator (Cloudflare, Caddy, or nginx on host) in front of port 8080

## Auto-deploy (GitHub Actions)

After a successful CI run on `main`, the **Deploy** workflow SSHs into your server and runs `scripts/deploy-remote.sh` (`git pull` + `docker compose up -d --build`).

### One-time server setup

```bash
git clone https://github.com/erezbabayan/BabiTk.git /opt/babitk
cd /opt/babitk
cp .env.production.example .env.production
# edit .env.production
docker compose up -d --build
```

### GitHub repository secrets

| Secret | Example |
|--------|---------|
| `DEPLOY_HOST` | `203.0.113.10` or `app.yourdomain.com` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_PRIVATE_KEY` | PEM private key (read-only deploy user recommended) |
| `DEPLOY_PATH` | `/opt/babitk` |
| `DEPLOY_PORT` | `22` (optional) |

Until these secrets are set, deploy is **skipped** (CI still runs).

### Local Git hooks

```powershell
.\scripts\install-git-hooks.ps1
```

Pre-commit reminds you to `git push` and blocks committing `.env` secret files.

## Quick start

```bash
cp .env.production.example .env.production
# Edit .env.production with your secrets

docker compose up -d --build
```

- **Web UI:** http://localhost:8080
- **Backend health:** http://localhost:3001/health (internal) or http://localhost:8080/health (via nginx)

## Architecture

```
Browser → nginx (web:80) → static React app
                        → /api/* → backend:3001
```

Cron jobs (inbox archive, daily digest, monthly usage reset) run inside the backend container when `CRON_ENABLED=true`.

## Supabase migrations

Run from project root:

```bash
npx supabase link --project-ref YOUR_REF
npx supabase db push
```

## Mobile app

Set in `mobile/.env` or EAS secrets:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

Build with EAS: `cd mobile && npx eas build`

## Premium tier

Premium is managed via **Stripe**:

1. Create a Product + recurring Price in [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Set `STRIPE_PRICE_ID` to the Price ID (`price_...`)
3. Add webhook endpoint: `https://api.yourdomain.com/api/billing/webhook`
4. Subscribe to events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

Users upgrade via **שדרג ל-Premium** in the web/mobile paywall. Subscription management uses Stripe Customer Portal (`POST /api/billing/portal`).

For local webhook testing:

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Manual override (support only):

```sql
UPDATE users SET tier = 'premium' WHERE id = 'USER_UUID';
```

## Backups

When `BACKUP_ENABLED=true`, the backend writes archives to the `backups` Docker volume at `/app/backups`.

## WhatsApp webhook

Point Meta webhook to:

```
https://api.yourdomain.com/api/whatsapp/webhook
```

Use the same `WHATSAPP_VERIFY_TOKEN` as in `.env.production`.
