#!/usr/bin/env bash
#
# Isolated browser end-to-end gate.
#
# Brings up ephemeral `kinetic-yak-e2e-*` PostgreSQL, Redis, and Mailpit
# containers on tmpfs, applies migrations and seed data with the real
# unprivileged roles, builds the admin standalone server, and runs the
# supported EN/FR journey subset against it with no live provider keys.
#
# Usage:
#   scripts/e2e-local.sh                 # full lifecycle: up, test, tear down
#   scripts/e2e-local.sh --keep          # keep containers and the admin server up
#   scripts/e2e-local.sh --skip-build    # reuse an existing .next build
#   scripts/e2e-local.sh -- e2e/auth-pages.e2e.ts   # custom Playwright targets
#
# Environment overrides: E2E_POSTGRES_PORT, E2E_REDIS_PORT, E2E_ADMIN_PORT,
# E2E_MAILPIT_SMTP_PORT, E2E_MAILPIT_UI_PORT.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="kinetic-yak-e2e"
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.e2e.yml)

POSTGRES_PORT="${E2E_POSTGRES_PORT:-25433}"
REDIS_PORT="${E2E_REDIS_PORT:-26380}"
ADMIN_PORT="${E2E_ADMIN_PORT:-13000}"
MAILPIT_SMTP_PORT="${E2E_MAILPIT_SMTP_PORT:-21025}"
MAILPIT_UI_PORT="${E2E_MAILPIT_UI_PORT:-28025}"

KEEP=0
SKIP_BUILD=0
TESTS=(
  e2e/auth-pages.e2e.ts
  e2e/auth-return-to.e2e.ts
  e2e/onboarding-flow.e2e.ts
  e2e/onboarding-pending.e2e.ts
  e2e/operator-auth.e2e.ts
  e2e/performance-startup.e2e.ts
  e2e/supported-journeys.e2e.ts
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --) shift; TESTS=("$@"); break ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

cleanup() {
  local status=$?
  if [[ "$KEEP" -eq 0 ]]; then
    echo "==> Removing isolated e2e containers"
    "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  else
    echo "==> Kept isolated containers (project: $PROJECT)"
  fi
  exit "$status"
}
trap cleanup EXIT

echo "==> Starting isolated PostgreSQL, Redis, and Mailpit"
"${COMPOSE[@]}" up -d --wait postgres redis mailpit

# The db CLI loads the repository .env unless told not to, and a developer's
# .env names a migrator URL pointing at their own database. Without this the
# migrations and the seed land there instead of the container below, leaving
# these containers empty and every spec failing on a missing `users` table.
export LOBBYSTACK_SKIP_ENV_FILES=true

export DATABASE_URL="postgres://postgres:e2e-postgres@127.0.0.1:${POSTGRES_PORT}/lobbystack"
export LOBBYSTACK_MIGRATOR_DATABASE_URL="postgres://postgres:e2e-postgres@127.0.0.1:${POSTGRES_PORT}/lobbystack"
export LOBBYSTACK_APP_DATABASE_URL="postgres://lobbystack_app:app@127.0.0.1:${POSTGRES_PORT}/lobbystack"
export LOBBYSTACK_AUTH_DATABASE_URL="postgres://lobbystack_auth:auth@127.0.0.1:${POSTGRES_PORT}/lobbystack"
export LOBBYSTACK_WORKER_DATABASE_URL="postgres://lobbystack_worker:worker@127.0.0.1:${POSTGRES_PORT}/lobbystack"
export LOBBYSTACK_DISPATCHER_DATABASE_URL="postgres://lobbystack_dispatcher:dispatcher@127.0.0.1:${POSTGRES_PORT}/lobbystack"
export LOBBYSTACK_APP_PASSWORD=app
export LOBBYSTACK_AUTH_PASSWORD=auth
export LOBBYSTACK_WORKER_PASSWORD=worker
export LOBBYSTACK_DISPATCHER_PASSWORD=dispatcher
export REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
export PLAYWRIGHT_BASE_URL="http://localhost:${ADMIN_PORT}"
export SMTP_HOST=127.0.0.1
export SMTP_PORT="$MAILPIT_SMTP_PORT"
export SMTP_SECURE=false
export EMAIL_FROM="LobbyStack <no-reply@example.test>"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "==> Building workspace packages and the admin standalone server"
  pnpm -r --filter "./packages/**" build
  pnpm --filter @lobbystack/admin build
fi

echo "==> Applying migrations and seed data with unprivileged roles"
pnpm --filter @lobbystack/db exec tsx src/cli.ts migrate
pnpm --filter @lobbystack/db exec tsx src/cli.ts seed

echo "==> Running the supported browser journeys"
CI=1 pnpm --filter @lobbystack/admin exec playwright test "${TESTS[@]}"
