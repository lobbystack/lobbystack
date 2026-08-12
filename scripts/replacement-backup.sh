#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${REPLACEMENT_COMPOSE_PROJECT:-}" ]]; then
  echo "REPLACEMENT_COMPOSE_PROJECT is required; refusing to target an ambient Compose project." >&2
  exit 1
fi
ENV_FILE="${REPLACEMENT_ENV_FILE:-$ROOT_DIR/.env.replacement}"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$ROOT_DIR/.env.replacement.example"
fi

BACKUP_DIR="${1:-$ROOT_DIR/.replacement-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$BACKUP_DIR/minio"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
COMPOSE=(docker compose --project-name "$REPLACEMENT_COMPOSE_PROJECT" --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.replacement.yml")
RUNNING_WRITERS=()

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

"${COMPOSE[@]}" run --rm --no-deps \
  --entrypoint /bin/sh \
  -v "$BACKUP_DIR:/backup" \
  minio-init -eu -c '
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mirror --overwrite --remove "local/$S3_BUCKET" /backup/minio
  '

(
  cd "$BACKUP_DIR"
  : > minio.sha256
  while IFS= read -r file; do
    shasum -a 256 "$file" >> minio.sha256
  done < <(find minio -type f | LC_ALL=C sort)
  shasum -a 256 postgres.dump minio.sha256 > SHA256SUMS
)

cat > "$BACKUP_DIR/manifest.txt" <<EOF
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
database=lobbystack
storage_bucket=$(${COMPOSE[@]} run --rm --no-deps --entrypoint /bin/sh minio-init -c 'printf %s "$S3_BUCKET"')
format=postgres-custom-plus-minio-mirror-v1
EOF

echo "Replacement backup created: $BACKUP_DIR"
