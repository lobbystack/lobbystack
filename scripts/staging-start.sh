#!/usr/bin/env bash
# Rebuild and start the staging environment from its configured sources.
# Stop it again with scripts/staging-stop.sh
set -euo pipefail

PROJECT_ID="${RAILWAY_PROJECT_ID:-af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT:-staging}"
export RAILWAY_CALLER="script:staging-start"

start() {
  local service="$1"
  echo "Starting ${service}..."
  railway service redeploy --project "$PROJECT_ID" --environment "$ENVIRONMENT" \
    --service "$service" --from-source --yes
}

# Datastores first, then migrations, then the apps.
start Postgres
start Redis
sleep 20
start migrator
sleep 20
start admin
start worker
start voice-gateway

echo
echo "Staging starting. Watch progress with:"
echo "  railway logs --project $PROJECT_ID --environment $ENVIRONMENT --service admin"
