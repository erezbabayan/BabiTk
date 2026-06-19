#!/usr/bin/env bash
# Run on the production server after git pull (also used by GitHub Actions deploy).
set -euo pipefail

ROOT="${DEPLOY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

ENV_FILE="${DEPLOY_ENV_FILE:-.env.production}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy from .env.production.example first."
  exit 1
fi

git fetch origin main
git reset --hard origin/main

docker compose --env-file "$ENV_FILE" up -d --build
docker image prune -f

echo "Deploy complete: $(git rev-parse --short HEAD)"
