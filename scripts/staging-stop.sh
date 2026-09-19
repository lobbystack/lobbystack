#!/usr/bin/env bash
# Remove all staging deployments so the environment stops billing compute.
# Volumes (Postgres/Redis data) and all variables are preserved.
# Bring it back with scripts/staging-start.sh
set -euo pipefail

PROJECT_ID="${RAILWAY_PROJECT_ID:-af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT:-staging}"
export RAILWAY_CALLER="script:staging-stop"

# Apps first, then the datastores they depend on.
SERVICES=(admin worker voice-gateway migrator Postgres Redis)

for service in "${SERVICES[@]}"; do
  echo "Stopping ${service}..."
  railway down --project "$PROJECT_ID" --environment "$ENVIRONMENT" --service "$service" --yes \
    || echo "  ${service}: already stopped"
done

echo
echo "Staging stopped. Data volumes are intact."
