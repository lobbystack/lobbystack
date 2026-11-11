#!/usr/bin/env bash
#
# Isolated browser end-to-end gate.
#
# Brings up ephemeral `kinetic-yak-e2e-*` PostgreSQL, Redis, and Mailpit
# containers on tmpfs, applies migrations and seed data with the real
# unprivileged roles, builds the admin standalone server, and runs the
# supported EN/FR journey subset against it with no live provider keys.
# It then runs e2e/full-stack against a real worker and local fakes for the
# carriers, Calendly, and the AI model.
#
# Usage:
#   scripts/e2e-local.sh                 # full lifecycle: up, test, tear down
#   scripts/e2e-local.sh --keep          # keep containers and the admin server up
#   scripts/e2e-local.sh --skip-build    # reuse an existing .next build
#   scripts/e2e-local.sh -- e2e/auth-pages.e2e.ts   # custom Playwright targets
#   scripts/e2e-local.sh --skip-build -- e2e/full-stack/calendly.e2e.ts
#
# Environment overrides: E2E_PROJECT (container names), E2E_POSTGRES_PORT,
# E2E_REDIS_PORT, E2E_ADMIN_PORT, E2E_WORKER_PORT, E2E_MAILPIT_SMTP_PORT,
# E2E_MAILPIT_UI_PORT.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${E2E_PROJECT:-kinetic-yak-e2e}"
export E2E_PROJECT="$PROJECT"
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.e2e.yml)

POSTGRES_PORT="${E2E_POSTGRES_PORT:-25433}"
REDIS_PORT="${E2E_REDIS_PORT:-26380}"
ADMIN_PORT="${E2E_ADMIN_PORT:-13000}"
MAILPIT_SMTP_PORT="${E2E_MAILPIT_SMTP_PORT:-21025}"
MAILPIT_UI_PORT="${E2E_MAILPIT_UI_PORT:-28025}"

KEEP=0
SKIP_BUILD=0
TESTS=(
  e2e/affiliate-program.e2e.ts
  e2e/agents.e2e.ts
  e2e/appointment-reschedule.e2e.ts
  e2e/auth-pages.e2e.ts
  e2e/auth-return-to.e2e.ts
  e2e/billing-return-cap.e2e.ts
  e2e/business-timezone.e2e.ts
  e2e/getting-started.e2e.ts
  e2e/home-analytics-metrics.e2e.ts
  e2e/manual-create.e2e.ts
  e2e/mobile-navigation.e2e.ts
  e2e/navigation.e2e.ts
  e2e/onboarding-flow.e2e.ts
  e2e/onboarding-path.e2e.ts
  e2e/onboarding-pending.e2e.ts
  e2e/operator-actions.e2e.ts
  e2e/operator-auth.e2e.ts
  e2e/performance-startup.e2e.ts
  e2e/rule-channels.e2e.ts
  e2e/setup-prompts.e2e.ts
  e2e/supported-journeys.e2e.ts
  e2e/widget-settings.e2e.ts
)
FULL_STACK_TESTS=(e2e/full-stack)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --)
      shift
      TESTS=()
      FULL_STACK_TESTS=()
      for target in "$@"; do
        if [[ "$target" == e2e/full-stack* ]]; then FULL_STACK_TESTS+=("$target"); else TESTS+=("$target"); fi
      done
      break
      ;;
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

if [[ "${#TESTS[@]}" -gt 0 ]]; then
  echo "==> Running the supported browser journeys"
  CI=1 pnpm --filter @lobbystack/admin exec playwright test "${TESTS[@]}"
fi

# After the others: the worker takes every queued job, and these specs own the fixed ports.
if [[ "${#FULL_STACK_TESTS[@]}" -gt 0 ]]; then
  echo "==> Running the full-stack journeys against a worker and local fakes"
  export MAILPIT_API_URL="http://127.0.0.1:${MAILPIT_UI_PORT}"
  FULL_STACK_E2E=1 CI=1 pnpm --filter @lobbystack/admin exec playwright test "${FULL_STACK_TESTS[@]}"
fi
