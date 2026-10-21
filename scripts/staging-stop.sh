#!/usr/bin/env bash
# Stop the Dokploy staging environment so it frees memory on the box it shares
# with production. Volumes (Postgres and Redis data) and variables stay intact.
# Bring it back with scripts/staging-start.sh. See docs/deployment/dokploy.md.
#
# Needs DOKPLOY_API_KEY (Dokploy: Settings > Profile > API keys).
set -euo pipefail

: "${DOKPLOY_API_KEY:?Set DOKPLOY_API_KEY to a Dokploy API key}"
DOKPLOY_URL="${DOKPLOY_URL:-https://deploy.lobbystack.com}"
PROJECT=LobbyStack
ENVIRONMENT=staging

post() {
  curl -fsS -X POST "$DOKPLOY_URL/api/$1" -H "x-api-key: $DOKPLOY_API_KEY" \
    -H 'content-type: application/json' --data-binary "$2" >/dev/null
}

# Prints "kind name id" for every staging service, e.g. "application worker abc123".
SERVICES="$(curl -fsS "$DOKPLOY_URL/api/project.all" -H "x-api-key: $DOKPLOY_API_KEY" |
  PROJECT="$PROJECT" ENVIRONMENT="$ENVIRONMENT" python3 -c '
import json, os, sys
project = next(p for p in json.load(sys.stdin) if p["name"] == os.environ["PROJECT"])
env = next(e for e in project["environments"] if e["name"] == os.environ["ENVIRONMENT"])
for db in env["postgres"]: print("postgres postgres", db["postgresId"])
for db in env["redis"]: print("redis redis", db["redisId"])
for app in env["applications"]: print("application", app["name"], app["applicationId"])
')"

id_of() { awk -v k="$1" -v n="$2" '$1 == k && $2 == n { print $3 }' <<<"$SERVICES"; }

# Apps first, then the datastores they depend on.
for app in admin worker migrator; do
  echo "Stopping ${app}..."
  post application.stop "{\"applicationId\":\"$(id_of application "$app")\"}"
done
echo "Stopping Redis and Postgres..."
post redis.stop "{\"redisId\":\"$(id_of redis redis)\"}"
post postgres.stop "{\"postgresId\":\"$(id_of postgres postgres)\"}"

echo
echo "Staging stopped. Data volumes are intact."
