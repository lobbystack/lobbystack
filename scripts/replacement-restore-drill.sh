#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_REPLACEMENT_RESTORE_DRILL:-}" != "1" ]]; then
  echo "Refusing destructive drill. Set CONFIRM_REPLACEMENT_RESTORE_DRILL=1." >&2
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
BACKUP_DIR="$ROOT_DIR/.tmp/replacement-restore-drill-$(date -u +%Y%m%dT%H%M%SZ)"
COMPOSE=(docker compose --project-name "$REPLACEMENT_COMPOSE_PROJECT" --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.yml")
MARKER="restore-drill-$(date -u +%s)"
mkdir -p "$BACKUP_DIR"
printf '%s' "$MARKER" > "$BACKUP_DIR/marker.txt"

cleanup() {
  "${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname lobbystack \
    --command "DROP TABLE IF EXISTS public.replacement_restore_drill;" >/dev/null 2>&1 || true
  "${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh minio-init -eu -c '
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc rm --force "local/$S3_BUCKET/recovery/restore-drill.txt" >/dev/null 2>&1 || true
  ' >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname lobbystack --set ON_ERROR_STOP=1 \
  --command "CREATE TABLE public.replacement_restore_drill (marker text PRIMARY KEY); INSERT INTO public.replacement_restore_drill VALUES ('$MARKER');" >/dev/null
"${COMPOSE[@]}" run --rm --no-deps \
  --entrypoint /bin/sh \
  -v "$BACKUP_DIR:/fixture:ro" \
  minio-init -eu -c '
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc cp /fixture/marker.txt "local/$S3_BUCKET/recovery/restore-drill.txt" >/dev/null
  '

"$ROOT_DIR/scripts/replacement-backup.sh" "$BACKUP_DIR/backup"
"${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname lobbystack \
  --command "DROP TABLE public.replacement_restore_drill;" >/dev/null
"${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh minio-init -eu -c '
  mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mc rm --force "local/$S3_BUCKET/recovery/restore-drill.txt" >/dev/null
'

CONFIRM_REPLACEMENT_RESTORE=1 "$ROOT_DIR/scripts/replacement-restore.sh" "$BACKUP_DIR/backup"

DATABASE_MARKER=$("${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname lobbystack --tuples-only --no-align \
  --command "SELECT marker FROM public.replacement_restore_drill;")
STORAGE_MARKER=$("${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh minio-init -eu -c '
  mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mc cat "local/$S3_BUCKET/recovery/restore-drill.txt"
')

if [[ "$DATABASE_MARKER" != "$MARKER" || "$STORAGE_MARKER" != "$MARKER" ]]; then
  echo "Restore drill integrity check failed" >&2
  exit 1
fi

echo "replacement-restore-postgres: ok"
echo "replacement-restore-minio: ok"
echo "Restore artifact retained for inspection: $BACKUP_DIR/backup"
