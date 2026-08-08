-- Table grants for runtime roles (tables created after default privileges were set)

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO lobbystack_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO lobbystack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO lobbystack_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO lobbystack_dispatcher;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO lobbystack_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO lobbystack_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO lobbystack_auth, lobbystack_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO
  lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
