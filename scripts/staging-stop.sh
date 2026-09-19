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

stop() {
  local service="$1" output status
  echo "Stopping ${service}..."

  set +e
  output="$(railway down --project "$PROJECT_ID" --environment "$ENVIRONMENT" \
    --service "$service" --yes 2>&1)"
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    return 0
  fi

  # An already-stopped service is the only failure worth ignoring. Expired
  # credentials, a missing service, or a network error must stop the run
  # rather than be reported as a successful shutdown.
  if printf '%s' "$output" | grep -q "No deployments found"; then
    echo "  ${service}: already stopped"
    return 0
  fi

  echo "  ${service}: shutdown failed" >&2
  printf '%s\n' "$output" >&2
  return 1
}

for service in "${SERVICES[@]}"; do
  stop "$service"
done

echo
echo "Staging stopped. Data volumes are intact."
