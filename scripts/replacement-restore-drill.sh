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

put_storage_marker() {
  if [[ "$STORAGE_PROVIDER" == "local" ]]; then
    "${COMPOSE[@]}" run --rm --no-deps \
      --user 0:0 \
      --entrypoint /bin/sh \
      -v "$BACKUP_DIR:/fixture:ro" \
      admin -eu -c '
        mkdir -p /var/lib/lobbystack/storage/recovery
        cp /fixture/marker.txt /var/lib/lobbystack/storage/recovery/restore-drill.txt
        chown -R 1001:1001 /var/lib/lobbystack/storage/recovery
      '
    return
  fi
  "${COMPOSE[@]}" run --rm --no-deps \
    --entrypoint /bin/sh \
    -v "$BACKUP_DIR:/fixture:ro" \
    minio-init -eu -c '
      mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
      mc cp /fixture/marker.txt "local/$S3_BUCKET/recovery/restore-drill.txt" >/dev/null
    '
}

delete_storage_marker() {
  if [[ "$STORAGE_PROVIDER" == "local" ]]; then
    "${COMPOSE[@]}" run --rm --no-deps --user 0:0 --entrypoint /bin/sh admin -eu -c '
      rm -f /var/lib/lobbystack/storage/recovery/restore-drill.txt
      rmdir /var/lib/lobbystack/storage/recovery >/dev/null 2>&1 || true
    '
    return
  fi
  "${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh minio-init -eu -c '
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc rm --force "local/$S3_BUCKET/recovery/restore-drill.txt" >/dev/null 2>&1 || true
  '
}

read_storage_marker() {
  if [[ "$STORAGE_PROVIDER" == "local" ]]; then
    "${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh admin -eu -c '
      cat /var/lib/lobbystack/storage/recovery/restore-drill.txt
    '
    return
  fi
  "${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/sh minio-init -eu -c '
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc cat "local/$S3_BUCKET/recovery/restore-drill.txt"
  '
}

cleanup() {
  "${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname lobbystack \
    --command "DROP TABLE IF EXISTS public.replacement_restore_drill;" >/dev/null 2>&1 || true
  delete_storage_marker >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname lobbystack --set ON_ERROR_STOP=1 \
  --command "CREATE TABLE public.replacement_restore_drill (marker text PRIMARY KEY); INSERT INTO public.replacement_restore_drill VALUES ('$MARKER');" >/dev/null
put_storage_marker

"$ROOT_DIR/scripts/replacement-backup.sh" "$BACKUP_DIR/backup"
"${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname lobbystack \
  --command "DROP TABLE public.replacement_restore_drill;" >/dev/null
delete_storage_marker

CONFIRM_REPLACEMENT_RESTORE=1 "$ROOT_DIR/scripts/replacement-restore.sh" "$BACKUP_DIR/backup"

DATABASE_MARKER=$("${COMPOSE[@]}" exec -T postgres psql --username postgres --dbname lobbystack --tuples-only --no-align \
  --command "SELECT marker FROM public.replacement_restore_drill;")
STORAGE_MARKER=$(read_storage_marker)

if [[ "$DATABASE_MARKER" != "$MARKER" || "$STORAGE_MARKER" != "$MARKER" ]]; then
  echo "Restore drill integrity check failed" >&2
  exit 1
fi

echo "replacement-restore-postgres: ok"
echo "replacement-restore-storage: ok"
echo "Restore artifact retained for inspection: $BACKUP_DIR/backup"
