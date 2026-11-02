#!/usr/bin/env bash
# Start the Dokploy staging environment: datastores, then the migrator and its
# `migrate` schedule, then the apps once migration has succeeded.
# Staging shares a box with production, so stop it again with
# scripts/staging-stop.sh when you finish. See docs/deployment/dokploy.md.
#
# Needs DOKPLOY_API_KEY (Dokploy: Settings > Profile > API keys).
set -euo pipefail

: "${DOKPLOY_API_KEY:?Set DOKPLOY_API_KEY to a Dokploy API key}"
DOKPLOY_URL="${DOKPLOY_URL:-https://deploy.lobbystack.com}"
PROJECT=LobbyStack
ENVIRONMENT=staging
HEALTH_URL="${STAGING_HEALTH_URL:-https://staging.lobbystack.com/api/health/ready}"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-300}"

# api GET <path> [key=value...] or api POST <path> <json>
api() {
  local method="$1" path="$2" param
  shift 2
  if [ "$method" = GET ]; then
    local query=()
    for param in "$@"; do query+=(--data-urlencode "$param"); done
    curl -fsS -G "$DOKPLOY_URL/api/$path" -H "x-api-key: $DOKPLOY_API_KEY" ${query[@]+"${query[@]}"}
  else
    curl -fsS -X POST "$DOKPLOY_URL/api/$path" -H "x-api-key: $DOKPLOY_API_KEY" \
      -H 'content-type: application/json' --data-binary "${1:-{\}}"
  fi
}

# Prints "kind name id" for every staging service, e.g. "application worker abc123".
services() {
  api GET project.all | PROJECT="$PROJECT" ENVIRONMENT="$ENVIRONMENT" python3 -c '
import json, os, sys
project = next(p for p in json.load(sys.stdin) if p["name"] == os.environ["PROJECT"])
env = next(e for e in project["environments"] if e["name"] == os.environ["ENVIRONMENT"])
for db in env["postgres"]: print("postgres postgres", db["postgresId"])
for db in env["redis"]: print("redis redis", db["redisId"])
for app in env["applications"]: print("application", app["name"], app["applicationId"])
'
}

id_of() { awk -v k="$1" -v n="$2" '$1 == k && $2 == n { print $3 }' <<<"$SERVICES"; }

SERVICES="$(services)"

echo "Starting Postgres and Redis..."
api POST postgres.start "{\"postgresId\":\"$(id_of postgres postgres)\"}" >/dev/null
api POST redis.start "{\"redisId\":\"$(id_of redis redis)\"}" >/dev/null

echo "Starting the migrator and running migrations..."
migrator="$(id_of application migrator)"
api POST application.start "{\"applicationId\":\"$migrator\"}" >/dev/null
schedule="$(api GET schedule.list "id=$migrator" scheduleType=application | python3 -c '
import json, sys
print(next(s["scheduleId"] for s in json.load(sys.stdin) if s["name"] == "migrate"))
')"
# runManually waits for the command and reports "error" when it exits non-zero,
# or when the migrator container hasn't started yet, so give it a few tries.
for attempt in 1 2 3 4 5 6; do
  result="$(api POST schedule.runManually "{\"scheduleId\":\"$schedule\"}" | python3 -c 'import json, sys; print(json.load(sys.stdin)["status"])')"
  [ "$result" = done ] && break
  sleep 10
done
if [ "$result" != done ]; then
  echo "  migrate: $result. Read the schedule's log in Dokploy before starting the apps." >&2
  exit 1
fi
echo "  migrate: done"

echo "Starting the worker and admin..."
api POST application.start "{\"applicationId\":\"$(id_of application worker)\"}" >/dev/null
api POST application.start "{\"applicationId\":\"$(id_of application admin)\"}" >/dev/null

waited=0
until curl -fsS -o /dev/null --max-time 5 "$HEALTH_URL"; do
  if [ "$waited" -ge "$READY_TIMEOUT_SECONDS" ]; then
    echo "  admin: not ready after ${READY_TIMEOUT_SECONDS}s ($HEALTH_URL)" >&2
    exit 1
  fi
  sleep 5
  waited=$((waited + 5))
done

echo
echo "Staging is up at ${HEALTH_URL%/api/health/ready}. Stop it with scripts/staging-stop.sh."
