#!/usr/bin/env bash
# Rebuild and start the staging environment from its configured sources.
# Follows the service order in docs/deployment/railway.md: datastores, then
# the migrator, then the apps once migration has succeeded.
# Stop it again with scripts/staging-stop.sh
set -euo pipefail

PROJECT_ID="${RAILWAY_PROJECT_ID:-af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT:-staging}"
# The migrator applies migrations twice and runs consistency and RLS checks,
# so give it room. Override for a slow build or a large migration.
DEPLOY_TIMEOUT_SECONDS="${DEPLOY_TIMEOUT_SECONDS:-900}"
export RAILWAY_CALLER="script:staging-start"

railway_for() {
  railway "$@" --project "$PROJECT_ID" --environment "$ENVIRONMENT"
}

# Newest deployment for a service, as "<id> <status>". Empty if it has none.
latest_deployment() {
  railway_for deployment list --service "$1" --json 2>/dev/null | python3 -c '
import json, sys
try:
    deployments = json.load(sys.stdin)
except ValueError:
    sys.exit(0)
if deployments:
    print(deployments[0]["id"], deployments[0]["status"])
'
}

start() {
  local service="$1" previous_id new_id status waited=0
  previous_id="$(latest_deployment "$service" | cut -d' ' -f1)"

  echo "Starting ${service}..."
  railway_for service redeploy --service "$service" --from-source --yes >/dev/null

  # Poll the deployment this run created, not whatever was there before.
  while [ "$waited" -lt "$DEPLOY_TIMEOUT_SECONDS" ]; do
    read -r new_id status <<<"$(latest_deployment "$service")"

    if [ -n "${new_id:-}" ] && [ "$new_id" != "$previous_id" ]; then
      case "$status" in
        SUCCESS)
          echo "  ${service}: ready"
          return 0
          ;;
        FAILED|CRASHED|REMOVED|SKIPPED)
          echo "  ${service}: deployment $status" >&2
          echo "  railway logs --project $PROJECT_ID --environment $ENVIRONMENT --service $service" >&2
          return 1
          ;;
      esac
    fi

    sleep 10
    waited=$((waited + 10))
  done

  echo "  ${service}: still ${status:-pending} after ${DEPLOY_TIMEOUT_SECONDS}s" >&2
  return 1
}

start Postgres
start Redis

# The apps must not come up against an unverified schema, so a migrator
# failure aborts the run here.
start migrator

start admin
start worker
start voice-gateway

echo
echo "Staging is up."
