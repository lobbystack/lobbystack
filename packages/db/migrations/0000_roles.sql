CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_migrator') THEN
    CREATE ROLE lobbystack_migrator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_auth') THEN
    CREATE ROLE lobbystack_auth NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_app') THEN
    CREATE ROLE lobbystack_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_worker') THEN
    CREATE ROLE lobbystack_worker NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_dispatcher') THEN
    CREATE ROLE lobbystack_dispatcher NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_readonly') THEN
    CREATE ROLE lobbystack_readonly NOLOGIN;
  END IF;
END
$$;

ALTER ROLE lobbystack_app NOBYPASSRLS;
ALTER ROLE lobbystack_worker NOBYPASSRLS;
ALTER ROLE lobbystack_dispatcher NOBYPASSRLS;
ALTER ROLE lobbystack_readonly NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO lobbystack_auth, lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
