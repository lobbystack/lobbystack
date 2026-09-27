-- OAuth 2.1 for MCP clients (Better Auth oauth-provider plugin).
--
-- Better Auth reads and writes these tables with the lobbystack_auth role.
-- A grant is an oauth_consents row: one client, one user, one business, with
-- reference_id holding the business id. Access and refresh tokens carry the
-- same reference_id. Tokens and client secrets are stored hashed or encrypted.
--
-- The dashboard (lobbystack_app) lists and revokes grants for the business in
-- its RLS context. The MCP endpoint (lobbystack_worker) resolves an access
-- token through a SECURITY DEFINER function, as it does for API keys.

CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id text NOT NULL,
  client_secret text,
  client_discovery_id text,
  disabled boolean DEFAULT false,
  skip_consent boolean,
  enable_end_session boolean,
  subject_type text,
  scopes text[],
  client_credentials_scopes text[] DEFAULT '{}'::text[],
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz,
  updated_at timestamptz,
  name text,
  uri text,
  icon text,
  contacts text[],
  tos text,
  policy text,
  software_id text,
  software_version text,
  software_statement text,
  redirect_uris text[] NOT NULL,
  post_logout_redirect_uris text[],
  backchannel_logout_uri text,
  backchannel_logout_session_required boolean,
  token_endpoint_auth_method text,
  application_type text,
  jwks text,
  jwks_uri text,
  grant_types text[],
  response_types text[],
  require_pkce boolean,
  dpop_bound_access_tokens boolean DEFAULT false,
  reference_id text,
  metadata jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_clients_client_id_unique ON public.oauth_clients(client_id);
CREATE INDEX IF NOT EXISTS oauth_clients_user_idx ON public.oauth_clients(user_id);

CREATE TABLE IF NOT EXISTS public.oauth_resources (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  identifier text NOT NULL,
  name text NOT NULL,
  access_token_ttl integer,
  refresh_token_ttl integer,
  signing_algorithm text,
  signing_key_id text,
  allowed_scopes text[],
  custom_claims jsonb,
  dpop_bound_access_tokens_required boolean DEFAULT false,
  disabled boolean DEFAULT false,
  created_at timestamptz,
  updated_at timestamptz,
  policy_version integer DEFAULT 1,
  metadata jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_resources_identifier_unique ON public.oauth_resources(identifier);

CREATE TABLE IF NOT EXISTS public.oauth_client_resources (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  resource_id text NOT NULL REFERENCES public.oauth_resources(identifier) ON DELETE CASCADE,
  metadata jsonb,
  created_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_client_resources_unique ON public.oauth_client_resources(client_id, resource_id);
CREATE INDEX IF NOT EXISTS oauth_client_resources_resource_idx ON public.oauth_client_resources(resource_id);

CREATE TABLE IF NOT EXISTS public.oauth_refresh_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token text NOT NULL,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reference_id text,
  authorization_code_id text,
  resources text[],
  requested_user_info_claims text[],
  expires_at timestamptz,
  created_at timestamptz,
  revoked timestamptz,
  rotated_at timestamptz,
  rotation_replay_response text,
  rotation_replay_expires_at timestamptz,
  auth_time timestamptz,
  confirmation jsonb,
  scopes text[] NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_refresh_tokens_token_unique ON public.oauth_refresh_tokens(token);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_grant_idx ON public.oauth_refresh_tokens(client_id, user_id, reference_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_session_idx ON public.oauth_refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_code_idx ON public.oauth_refresh_tokens(authorization_code_id);

CREATE TABLE IF NOT EXISTS public.oauth_access_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token text,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  reference_id text,
  authorization_code_id text,
  resources text[],
  requested_user_info_claims text[],
  refresh_id text REFERENCES public.oauth_refresh_tokens(id) ON DELETE CASCADE,
  expires_at timestamptz,
  created_at timestamptz,
  revoked timestamptz,
  confirmation jsonb,
  scopes text[] NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_access_tokens_token_unique ON public.oauth_access_tokens(token);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_grant_idx ON public.oauth_access_tokens(client_id, user_id, reference_id);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_refresh_idx ON public.oauth_access_tokens(refresh_id);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_session_idx ON public.oauth_access_tokens(session_id);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_code_idx ON public.oauth_access_tokens(authorization_code_id);

CREATE TABLE IF NOT EXISTS public.oauth_consents (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  reference_id text,
  resources text[],
  requested_user_info_claims text[],
  scopes text[] NOT NULL,
  created_at timestamptz,
  updated_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_consents_grant_idx ON public.oauth_consents(client_id, user_id, reference_id);
CREATE INDEX IF NOT EXISTS oauth_consents_reference_idx ON public.oauth_consents(reference_id);

-- Replay tombstones for private_key_jwt client assertions; the id is chosen by the plugin.
CREATE TABLE IF NOT EXISTS public.oauth_client_assertions (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

-- Better Auth has no tenant context, so the auth role sees every row, as it
-- does for users and sessions. No other role gets these tables unless a
-- policy below grants it.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['oauth_clients', 'oauth_resources', 'oauth_client_resources', 'oauth_refresh_tokens', 'oauth_access_tokens', 'oauth_consents', 'oauth_client_assertions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_auth_access ON public.%I', table_name, table_name);
    EXECUTE format('CREATE POLICY %I_auth_access ON public.%I TO lobbystack_auth USING (true) WITH CHECK (true)', table_name, table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_auth', table_name);
  END LOOP;
END
$$;

-- The dashboard sees a business's grants, and the tokens issued under them,
-- only as an operator who belongs to that business.
CREATE OR REPLACE FUNCTION app.can_manage_oauth_reference(target_reference_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT target_reference_id IS NOT NULL
    AND app.current_actor_type() = 'operator'
    AND target_reference_id = app.current_business_id()::text
    AND app.has_business_membership(app.current_business_id())
$$;

DROP POLICY IF EXISTS oauth_consents_operator ON public.oauth_consents;
CREATE POLICY oauth_consents_operator ON public.oauth_consents TO lobbystack_app
  USING (app.can_manage_oauth_reference(reference_id))
  WITH CHECK (app.can_manage_oauth_reference(reference_id));
GRANT SELECT, DELETE ON public.oauth_consents TO lobbystack_app;

DROP POLICY IF EXISTS oauth_access_tokens_operator ON public.oauth_access_tokens;
CREATE POLICY oauth_access_tokens_operator ON public.oauth_access_tokens TO lobbystack_app
  USING (app.can_manage_oauth_reference(reference_id))
  WITH CHECK (app.can_manage_oauth_reference(reference_id));
GRANT SELECT (id, client_id, user_id, reference_id, expires_at, created_at, revoked), UPDATE (revoked) ON public.oauth_access_tokens TO lobbystack_app;

DROP POLICY IF EXISTS oauth_refresh_tokens_operator ON public.oauth_refresh_tokens;
CREATE POLICY oauth_refresh_tokens_operator ON public.oauth_refresh_tokens TO lobbystack_app
  USING (app.can_manage_oauth_reference(reference_id))
  WITH CHECK (app.can_manage_oauth_reference(reference_id));
GRANT SELECT (id, client_id, user_id, reference_id, expires_at, created_at, revoked), UPDATE (revoked) ON public.oauth_refresh_tokens TO lobbystack_app;

-- Client names and links for the business's connected apps. Secrets stay hidden.
DROP POLICY IF EXISTS oauth_clients_operator ON public.oauth_clients;
CREATE POLICY oauth_clients_operator ON public.oauth_clients FOR SELECT TO lobbystack_app
  USING (EXISTS (SELECT 1 FROM public.oauth_consents consent WHERE consent.client_id = oauth_clients.client_id AND app.can_manage_oauth_reference(consent.reference_id)));
GRANT SELECT (id, client_id, name, uri, client_discovery_id, disabled) ON public.oauth_clients TO lobbystack_app;

-- MCP requests arrive without a tenant context. This resolver maps an access
-- token hash to its grant and business. It returns nothing when the token is
-- revoked or expired, the grant was revoked, the client is disabled, the
-- business is inactive, or the user who granted access is no longer an owner
-- or admin of the business.
CREATE OR REPLACE FUNCTION app.resolve_oauth_access_token(p_token_hash text)
RETURNS TABLE (business_id uuid, grant_id text, user_id uuid, client_id text, client_name text, scopes text[], resources text[], expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, consent.id, token.user_id, token.client_id, client.name,
    ARRAY(SELECT scope FROM unnest(token.scopes) AS scope WHERE scope = ANY (consent.scopes)),
    token.resources, token.expires_at
  FROM public.oauth_access_tokens token
  JOIN public.oauth_consents consent
    ON consent.client_id = token.client_id AND consent.user_id = token.user_id AND consent.reference_id = token.reference_id
  JOIN public.oauth_clients client ON client.client_id = token.client_id
  JOIN public.businesses business ON business.id::text = token.reference_id
  JOIN public.business_memberships membership
    ON membership.business_id = business.id AND membership.user_id = token.user_id
  WHERE token.token = p_token_hash
    AND token.revoked IS NULL
    AND token.expires_at > now()
    AND COALESCE(client.disabled, false) = false
    AND business.status = 'active'
    AND membership.status = 'active'
    AND membership.role IN ('business_owner', 'business_admin')
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_oauth_access_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_oauth_access_token(text) TO lobbystack_worker;

-- Records when a grant was last used, at most once a minute.
CREATE OR REPLACE FUNCTION app.touch_oauth_grant(p_grant_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.oauth_consents
  SET last_used_at = now()
  WHERE id = p_grant_id AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
$$;

REVOKE ALL ON FUNCTION app.touch_oauth_grant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.touch_oauth_grant(text) TO lobbystack_worker;
