ALTER ROLE lobbystack_migrator SET search_path = public, app, pg_catalog;
ALTER ROLE lobbystack_auth SET search_path = public, app, pg_catalog;
ALTER ROLE lobbystack_app SET search_path = public, app, pg_catalog;
ALTER ROLE lobbystack_worker SET search_path = public, app, pg_catalog;
ALTER ROLE lobbystack_dispatcher SET search_path = public, app, pg_catalog;
ALTER ROLE lobbystack_readonly SET search_path = public, app, pg_catalog;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbox_messages TO lobbystack_dispatcher;
