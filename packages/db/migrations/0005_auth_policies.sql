-- Auth service role needs unrestricted access to auth tables for signup/signin flows.

DROP POLICY IF EXISTS users_self_access ON auth.users;
CREATE POLICY users_auth_service ON auth.users
  FOR ALL
  TO lobbystack_auth
  USING (true)
  WITH CHECK (true);

CREATE POLICY users_self_read ON auth.users
  FOR SELECT
  TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly
  USING (
    app.is_platform_actor()
    OR id::text = app.current_user_id()::text
  );

ALTER TABLE auth.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_auth_service ON auth.accounts;
CREATE POLICY accounts_auth_service ON auth.accounts
  FOR ALL
  TO lobbystack_auth
  USING (true)
  WITH CHECK (true);

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_auth_service ON auth.sessions;
CREATE POLICY sessions_auth_service ON auth.sessions
  FOR ALL
  TO lobbystack_auth
  USING (true)
  WITH CHECK (true);

ALTER TABLE auth.verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.verification_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS verification_auth_service ON auth.verification_tokens;
CREATE POLICY verification_auth_service ON auth.verification_tokens
  FOR ALL
  TO lobbystack_auth
  USING (true)
  WITH CHECK (true);

ALTER TABLE auth.pending_email_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.pending_email_changes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pending_email_auth_service ON auth.pending_email_changes;
CREATE POLICY pending_email_auth_service ON auth.pending_email_changes
  FOR ALL
  TO lobbystack_auth
  USING (true)
  WITH CHECK (true);
