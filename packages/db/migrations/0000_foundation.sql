-- Foundation migration: extensions, schemas, and database roles

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_migrator') THEN
    CREATE ROLE lobbystack_migrator NOINHERIT LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_auth') THEN
    CREATE ROLE lobbystack_auth NOINHERIT LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_app') THEN
    CREATE ROLE lobbystack_app NOINHERIT LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_worker') THEN
    CREATE ROLE lobbystack_worker NOINHERIT LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_dispatcher') THEN
    CREATE ROLE lobbystack_dispatcher NOINHERIT LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_readonly') THEN
    CREATE ROLE lobbystack_readonly NOINHERIT LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA auth TO
  lobbystack_migrator,
  lobbystack_auth,
  lobbystack_app,
  lobbystack_worker,
  lobbystack_dispatcher,
  lobbystack_readonly;

GRANT USAGE ON SCHEMA app TO
  lobbystack_migrator,
  lobbystack_auth,
  lobbystack_app,
  lobbystack_worker,
  lobbystack_dispatcher,
  lobbystack_readonly;

GRANT ALL PRIVILEGES ON SCHEMA auth TO lobbystack_migrator;
GRANT ALL PRIVILEGES ON SCHEMA app TO lobbystack_migrator;

ALTER DEFAULT PRIVILEGES IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lobbystack_auth;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lobbystack_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lobbystack_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lobbystack_dispatcher;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT ON TABLES TO lobbystack_readonly;

COMMENT ON SCHEMA auth IS 'Authentication and identity tables';
COMMENT ON SCHEMA app IS 'Tenant-scoped application tables';
