#!/usr/bin/env bash
# Runs the checks GitHub Actions runs before a production release (ci.yml and
# the workflows it calls) on this machine, for when Actions can't run. It checks
# one commit in a clean worktree, with throwaway PostgreSQL and Redis containers,
# and stops at the first failure. It deploys nothing.
#
# Usage: scripts/release-local.sh [ref]    (default: HEAD)
#
# Not covered: CodeQL and the marketing link check, which only run on GitHub.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SHA="$(git -C "$ROOT" rev-parse "${1:-HEAD}")"
WORK="$(mktemp -d)/release-check"
PG="release-check-pg-$$"
REDIS="release-check-redis-$$"
NET="release-check-net-$$"
PG_PORT="${RELEASE_CHECK_PG_PORT:-35432}"
REDIS_PORT="${RELEASE_CHECK_REDIS_PORT:-36379}"
TRIVY="aquasec/trivy:0.70.0"

cleanup() {
  docker rm -f "$PG" "$REDIS" "$NET-pg" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  git -C "$ROOT" worktree remove --force "$WORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

step() { echo; echo "==> $*"; "$@"; }

wait_for_postgres() { # container database
  for _ in {1..60}; do
    docker exec "$1" pg_isready -U postgres -d "$2" >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "$1 did not become ready" >&2
  return 1
}

echo "Checking ${SHA:0:12} in $WORK"
git -C "$ROOT" worktree add --detach "$WORK" "$SHA" >/dev/null
cd "$WORK"

docker run -d --name "$PG" -e POSTGRES_PASSWORD=lobbystack -e POSTGRES_DB=lobbystack -p "127.0.0.1:$PG_PORT:5432" pgvector/pgvector:pg16 >/dev/null
docker run -d --name "$REDIS" -p "127.0.0.1:$REDIS_PORT:6379" redis:7.4-alpine >/dev/null
wait_for_postgres "$PG" lobbystack
docker exec "$PG" psql -U postgres -qc "create database lobbystack_test"

# --- ci.yml: checks -----------------------------------------------------------
step pnpm install --frozen-lockfile
step pnpm test:build-config
step pnpm typecheck
step pnpm --filter @lobbystack/admin lint
step pnpm telemetry:coverage
step pnpm build
step git diff --exit-code -- apps/admin/public/embed/embed.js
step pnpm test
step pnpm replacement:telemetry
step docker compose --env-file .env.example -f docker-compose.yml config --quiet

# --- ci.yml: zapier -----------------------------------------------------------
(cd integrations/zapier && step npm ci && step npm test)

# --- ci.yml: database ---------------------------------------------------------
(
  url() { echo "postgres://$1@127.0.0.1:$PG_PORT/lobbystack_test"; }
  export NODE_ENV=test LOBBYSTACK_SKIP_ENV_FILES=true VERIFY_RLS_BEHAVIOR=true
  export DATABASE_URL="$(url postgres:lobbystack)"
  export LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL="$DATABASE_URL" LOBBYSTACK_AUTH_TEST_DATABASE_URL="$DATABASE_URL"
  export LOBBYSTACK_APP_DATABASE_URL="$(url lobbystack_app:app)" LOBBYSTACK_AUTH_DATABASE_URL="$(url lobbystack_auth:auth)"
  export LOBBYSTACK_WORKER_DATABASE_URL="$(url lobbystack_worker:worker)" LOBBYSTACK_DISPATCHER_DATABASE_URL="$(url lobbystack_dispatcher:dispatcher)"
  export LOBBYSTACK_APP_PASSWORD=app LOBBYSTACK_AUTH_PASSWORD=auth LOBBYSTACK_WORKER_PASSWORD=worker LOBBYSTACK_DISPATCHER_PASSWORD=dispatcher
  export REDIS_URL="redis://127.0.0.1:$REDIS_PORT" REDIS_TEST_URL="redis://127.0.0.1:$REDIS_PORT"
  step pnpm -r --filter "./packages/**" build
  for _ in 1 2; do
    step pnpm db:migrate
    step pnpm --filter @lobbystack/db exec tsx src/cli.ts bootstrap
  done
  step pnpm db:check
  step pnpm db:verify-rls
  step pnpm test:reliability
  step pnpm --filter @lobbystack/admin exec vitest run src/lib/auth-issuance.integration.test.ts src/lib/email-verification-policy.test.ts
  step pnpm --filter @lobbystack/admin exec vitest run src/lib/voice-presence.integration.test.ts
)

# --- ci.yml: e2e --------------------------------------------------------------
step pnpm --filter @lobbystack/admin exec playwright install chromium
step bash scripts/e2e-local.sh

# --- runtime-images.yml -------------------------------------------------------
docker network create "$NET" >/dev/null
for service in admin worker migrator; do
  step docker build -f "Dockerfile.$service" --build-arg "SERVICE_VERSION=$SHA" -t "lobbystack/$service:release-check" .
  echo "==> no source maps in the $service image"
  docker run --rm --entrypoint node "lobbystack/$service:release-check" -e 'const fs = require("node:fs"); const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const path = `${dir}/${entry.name}`; if (entry.isDirectory()) walk(path); else if (entry.isFile() && entry.name.endsWith(".map")) throw new Error(`Runtime source map: ${path}`); } }; walk("/app");'
  if [[ "$service" == migrator ]]; then
    docker run -d --name "$NET-pg" --network "$NET" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=lobbystack_test pgvector/pgvector:pg16 >/dev/null
    wait_for_postgres "$NET-pg" lobbystack_test
    for _ in 1 2; do
      step docker run --rm --network "$NET" -e "DATABASE_URL=postgres://postgres:test@$NET-pg:5432/lobbystack_test" lobbystack/migrator:release-check
    done
  fi
  step docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$TRIVY" image --quiet --scanners vuln --pkg-types os,library --severity CRITICAL --ignore-unfixed --exit-code 1 "lobbystack/$service:release-check"
done

# --- replacement-platform.yml: replacement-validate ---------------------------
(
  url() { echo "postgres://$1@127.0.0.1:$PG_PORT/lobbystack"; }
  export DATABASE_URL="$(url postgres:lobbystack)" REDIS_URL="redis://127.0.0.1:$REDIS_PORT" VERIFY_RLS_BEHAVIOR=true
  export LOBBYSTACK_APP_DATABASE_URL="$(url lobbystack_app:app)" LOBBYSTACK_AUTH_DATABASE_URL="$(url lobbystack_auth:auth)"
  export LOBBYSTACK_WORKER_DATABASE_URL="$(url lobbystack_worker:worker)" LOBBYSTACK_DISPATCHER_DATABASE_URL="$(url lobbystack_dispatcher:dispatcher)"
  step pnpm lint
  echo "==> replacement runtime roles"
  docker exec -i -e POSTGRES_USER=postgres -e POSTGRES_DB=lobbystack "$PG" bash < docker/postgres/init/roles.sh
  step pnpm db:migrate
  step pnpm db:migrate
  step pnpm db:check
  step pnpm db:verify-rls
  step pnpm db:seed
  for check in parity drift security recovery notifications billing email-send sms-consent feedback appointment-audits unit-economics phone-onboarding call-detail roles locale; do
    step pnpm "replacement:$check"
  done
  step pnpm -r --filter "./packages/**" build
  step pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/release-readiness.ts --evidence certification-results/deterministic-baseline.json
  step env CI=true pnpm --filter @lobbystack/admin e2e
  step pnpm replacement:telemetry
)
step docker run --rm -v "$WORK:/src" "$TRIVY" fs --quiet --scanners vuln,secret,misconfig --severity CRITICAL --ignore-unfixed --exit-code 1 /src
step docker compose --env-file .env.example -f docker-compose.yml config --quiet

echo
echo "All release checks passed for ${SHA:0:12}."
