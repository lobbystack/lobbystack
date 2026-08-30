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

for file in postgres.dump SHA256SUMS manifest.txt; do
  if [[ ! -f "$BACKUP_DIR/$file" ]]; then
    echo "Backup is missing $file" >&2
    exit 1
  fi
done

BACKUP_STORAGE_PROVIDER=$(sed -n 's/^storage_provider=//p' "$BACKUP_DIR/manifest.txt" | head -n 1)
if [[ -z "$BACKUP_STORAGE_PROVIDER" ]]; then
  BACKUP_STORAGE_PROVIDER=s3
fi
TARGET_STORAGE_PROVIDER=$("${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh admin -eu -c '
  if [ -n "${STORAGE_PROVIDER:-}" ]; then
    printf %s "$STORAGE_PROVIDER"
  elif [ -n "${S3_ENDPOINT:-}${S3_BUCKET:-}${S3_REGION:-}${S3_ACCESS_KEY_ID:-}${S3_SECRET_ACCESS_KEY:-}" ]; then
    printf s3
  else
    printf local
  fi
')
if [[ "$BACKUP_STORAGE_PROVIDER" != "local" && "$BACKUP_STORAGE_PROVIDER" != "s3" ]]; then
  echo "Backup uses unsupported storage provider: $BACKUP_STORAGE_PROVIDER" >&2
  exit 1
fi
if [[ "$TARGET_STORAGE_PROVIDER" != "$BACKUP_STORAGE_PROVIDER" ]]; then
  echo "Backup storage provider $BACKUP_STORAGE_PROVIDER does not match target provider $TARGET_STORAGE_PROVIDER" >&2
  exit 1
fi

if [[ "$BACKUP_STORAGE_PROVIDER" == "local" ]]; then
  STORAGE_CHECKSUMS=storage.sha256
  STORAGE_DIRECTORY=storage
else
  STORAGE_CHECKSUMS=minio.sha256
  STORAGE_DIRECTORY=minio
fi
if [[ ! -f "$BACKUP_DIR/$STORAGE_CHECKSUMS" || ! -d "$BACKUP_DIR/$STORAGE_DIRECTORY" ]]; then
  echo "Backup is missing $STORAGE_DIRECTORY data or $STORAGE_CHECKSUMS" >&2
  exit 1
fi
(
  cd "$BACKUP_DIR"
  shasum -a 256 -c SHA256SUMS
  if [[ -s "$STORAGE_CHECKSUMS" ]]; then
    shasum -a 256 -c "$STORAGE_CHECKSUMS"
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
if [[ "$BACKUP_STORAGE_PROVIDER" == "local" ]]; then
  "${COMPOSE[@]}" run --rm --no-deps \
    --user 0:0 \
    --entrypoint /bin/sh \
    -v "$BACKUP_DIR:/backup:ro" \
    admin -eu -c '
      find /var/lib/lobbystack/storage -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
      cp -a /backup/storage/. /var/lib/lobbystack/storage/
      chown -R 1001:1001 /var/lib/lobbystack/storage
    '
else
  "${COMPOSE[@]}" run --rm --no-deps \
    --entrypoint /bin/sh \
    -v "$BACKUP_DIR:/backup:ro" \
    minio-init -eu -c '
      mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
      mc rm --recursive --force "local/$S3_BUCKET" >/dev/null || true
      mc mirror --overwrite /backup/minio "local/$S3_BUCKET"
    '
fi

echo "Replacement backup restored: $BACKUP_DIR"
