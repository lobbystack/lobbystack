#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_REPLACEMENT_RESTORE:-}" != "1" ]]; then
  echo "Refusing destructive restore. Set CONFIRM_REPLACEMENT_RESTORE=1." >&2
  exit 1
fi
if [[ $# -ne 1 ]]; then
  echo "Usage: CONFIRM_REPLACEMENT_RESTORE=1 $0 <backup-directory>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${REPLACEMENT_COMPOSE_PROJECT:-}" ]]; then
  echo "REPLACEMENT_COMPOSE_PROJECT is required; refusing to target an ambient Compose project." >&2
  exit 1
fi
ENV_FILE="${REPLACEMENT_ENV_FILE:-$ROOT_DIR/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$ROOT_DIR/.env.example"
fi
BACKUP_DIR="$(cd "$1" && pwd)"
COMPOSE=(docker compose --project-name "$REPLACEMENT_COMPOSE_PROJECT" --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.yml")
RUNNING_WRITERS=()

for file in postgres.dump minio.sha256 SHA256SUMS manifest.txt; do
  if [[ ! -f "$BACKUP_DIR/$file" ]]; then
    echo "Backup is missing $file" >&2
    exit 1
  fi
done
(
  cd "$BACKUP_DIR"
  shasum -a 256 -c SHA256SUMS
  if [[ -s minio.sha256 ]]; then
    shasum -a 256 -c minio.sha256
  fi
)

while IFS= read -r service; do
  case "$service" in
    admin|worker|voice-gateway) RUNNING_WRITERS+=("$service") ;;
  esac
done < <("${COMPOSE[@]}" ps --services --filter status=running)

restart_writers() {
  if [[ ${#RUNNING_WRITERS[@]} -gt 0 ]]; then
    "${COMPOSE[@]}" start "${RUNNING_WRITERS[@]}" >/dev/null
  fi
}
trap restart_writers EXIT

if [[ ${#RUNNING_WRITERS[@]} -gt 0 ]]; then
  "${COMPOSE[@]}" stop "${RUNNING_WRITERS[@]}" >/dev/null
fi

"${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  --command "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'lobbystack' AND pid <> pg_backend_pid();" >/dev/null
"${COMPOSE[@]}" exec -T postgres dropdb --username postgres --if-exists lobbystack
"${COMPOSE[@]}" exec -T postgres createdb --username postgres lobbystack
"${COMPOSE[@]}" exec -T postgres pg_restore \
  --username postgres \
  --dbname lobbystack \
  --exit-on-error \
  --no-owner < "$BACKUP_DIR/postgres.dump"

"${COMPOSE[@]}" exec -T redis redis-cli FLUSHDB >/dev/null
"${COMPOSE[@]}" run --rm --no-deps \
  --entrypoint /bin/sh \
  -v "$BACKUP_DIR:/backup:ro" \
  minio-init -eu -c '
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc rm --recursive --force "local/$S3_BUCKET" >/dev/null || true
    mc mirror --overwrite /backup/minio "local/$S3_BUCKET"
  '

echo "Replacement backup restored: $BACKUP_DIR"
