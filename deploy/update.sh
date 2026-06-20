#!/usr/bin/env bash
# ERP redeploy — pull latest, rebuild everything, sync schema, restart.
#
# Usage (from anywhere in the repo):
#   ./deploy/update.sh            # full redeploy incl. prisma db push
#   ./deploy/update.sh --no-db    # skip the schema sync (no schema changes)
#
# Requires sudo for the systemctl/nginx steps (run as a sudo-capable user).
set -euo pipefail

# Resolve repo root (this script lives in <root>/deploy/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

RUN_DB=1
for arg in "$@"; do
  case "$arg" in
    --no-db) RUN_DB=0 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }

say "Pulling latest from git…"
git pull --ff-only

say "Installing dependencies…"
npm install

say "Building shared package…"
npm run build -w @erp/shared

say "Generating Prisma client…"
npx prisma generate --schema apps/api/prisma/schema.prisma

say "Building API…"
npm run build -w @erp/api

say "Building web…"
npm run build -w @erp/web

if [ "$RUN_DB" -eq 1 ]; then
  say "Syncing database schema (prisma db push)…"
  # Load DATABASE_URL (and other vars) for the Prisma CLI
  set -a; . apps/api/.env; set +a
  npx prisma db push --schema apps/api/prisma/schema.prisma
else
  say "Skipping database schema sync (--no-db)"
fi

say "Restarting API service…"
sudo systemctl restart erp-api

say "Reloading nginx…"
sudo nginx -t && sudo systemctl reload nginx

say "Done. Verifying API health…"
sleep 2
curl -fsS http://127.0.0.1:4000/health && echo
