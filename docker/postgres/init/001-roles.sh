#!/bin/sh
set -eu

database="${POSTGRES_DB:-lobbystack}"

psql_args="--username=${POSTGRES_USER} --dbname=${database} --set=ON_ERROR_STOP=1"

psql ${psql_args} <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
SQL

create_role() {
  role="$1"
  password="$2"
psql ${psql_args} \
    --set="role_name=${role}" \
    --set="role_password=${password}" <<'SQL'
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role_name')
    THEN format('ALTER ROLE %I LOGIN PASSWORD %L', :'role_name', :'role_password')
  ELSE format('CREATE ROLE %I LOGIN PASSWORD %L', :'role_name', :'role_password')
END;
\gexec
SQL
}

create_role lobbystack_migrator "${POSTGRES_MIGRATOR_PASSWORD:?Set POSTGRES_MIGRATOR_PASSWORD}"
create_role lobbystack_auth "${POSTGRES_AUTH_PASSWORD:?Set POSTGRES_AUTH_PASSWORD}"
create_role lobbystack_app "${POSTGRES_APP_PASSWORD:?Set POSTGRES_APP_PASSWORD}"
create_role lobbystack_worker "${POSTGRES_WORKER_PASSWORD:?Set POSTGRES_WORKER_PASSWORD}"
create_role lobbystack_dispatcher "${POSTGRES_DISPATCHER_PASSWORD:?Set POSTGRES_DISPATCHER_PASSWORD}"
create_role lobbystack_readonly "${POSTGRES_READONLY_PASSWORD:?Set POSTGRES_READONLY_PASSWORD}"

psql ${psql_args} <<SQL
ALTER ROLE lobbystack_migrator BYPASSRLS;
GRANT CREATE ON DATABASE "${database}" TO lobbystack_migrator;
SQL
