#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${REPLACEMENT_COMPOSE_PROJECT:-}" ]]; then
  echo "REPLACEMENT_COMPOSE_PROJECT is required; refusing to target an ambient Compose project." >&2
  exit 1
fi
ENV_FILE="${REPLACEMENT_ENV_FILE:-$ROOT_DIR/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$ROOT_DIR/.env.example"
fi

BACKUP_DIR="${1:-$ROOT_DIR/.replacement-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
COMPOSE=(docker compose --project-name "$REPLACEMENT_COMPOSE_PROJECT" --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.yml")
RUNNING_WRITERS=()

STORAGE_PROVIDER=$("${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh admin -eu -c '
  if [ -n "${STORAGE_PROVIDER:-}" ]; then
    printf %s "$STORAGE_PROVIDER"
  elif [ -n "${S3_ENDPOINT:-}${S3_BUCKET:-}${S3_REGION:-}${S3_ACCESS_KEY_ID:-}${S3_SECRET_ACCESS_KEY:-}" ]; then
    printf s3
  else
    printf local
  fi
')
if [[ "$STORAGE_PROVIDER" != "local" && "$STORAGE_PROVIDER" != "s3" ]]; then
  echo "Unsupported storage provider: $STORAGE_PROVIDER" >&2
  exit 1
fi

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

"${COMPOSE[@]}" exec -T postgres pg_dump \
  --username postgres \
  --dbname lobbystack \
  --format custom \
  --compress 9 \
  --no-owner > "$BACKUP_DIR/postgres.dump"

if [[ "$STORAGE_PROVIDER" == "local" ]]; then
  mkdir -p "$BACKUP_DIR/storage"
  "${COMPOSE[@]}" run --rm --no-deps \
    --user 0:0 \
    --entrypoint /bin/sh \
    -v "$BACKUP_DIR:/backup" \
    admin -eu -c '
      find /backup/storage -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
      cp -a /var/lib/lobbystack/storage/. /backup/storage/
    '
  STORAGE_DIRECTORY=storage
  STORAGE_CHECKSUMS=storage.sha256
  STORAGE_LOCATION=/var/lib/lobbystack/storage
  BACKUP_FORMAT=postgres-custom-plus-local-storage-v1
else
  mkdir -p "$BACKUP_DIR/minio"
  "${COMPOSE[@]}" run --rm --no-deps \
    --entrypoint /bin/sh \
    -v "$BACKUP_DIR:/backup" \
    minio-init -eu -c '
      mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
      mc mirror --overwrite --remove "local/$S3_BUCKET" /backup/minio
    '
  STORAGE_DIRECTORY=minio
  STORAGE_CHECKSUMS=minio.sha256
  STORAGE_LOCATION=$("${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh minio-init -c 'printf %s "$S3_BUCKET"')
  BACKUP_FORMAT=postgres-custom-plus-minio-mirror-v1
fi

(
  cd "$BACKUP_DIR"
  : > "$STORAGE_CHECKSUMS"
  while IFS= read -r file; do
    shasum -a 256 "$file" >> "$STORAGE_CHECKSUMS"
  done < <(find "$STORAGE_DIRECTORY" -type f | LC_ALL=C sort)
  shasum -a 256 postgres.dump "$STORAGE_CHECKSUMS" > SHA256SUMS
)

cat > "$BACKUP_DIR/manifest.txt" <<EOF
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
database=lobbystack
storage_provider=$STORAGE_PROVIDER
storage_location=$STORAGE_LOCATION
format=$BACKUP_FORMAT
EOF

echo "Replacement backup created: $BACKUP_DIR"
