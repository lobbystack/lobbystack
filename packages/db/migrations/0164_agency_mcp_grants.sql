-- Agency connections: an OAuth grant an MCP client holds for one person on
-- a partner's team, rather than for one business (ADR 0011).
--
-- Better Auth stores a grant as an oauth_consents row whose reference_id the
-- consent page picks. A business grant keeps the business id there, as 0069
-- defined. An agency grant keeps 'partner:<partner id>', and the access and
-- refresh tokens issued under it carry the same value. Nothing else changes in
-- Better Auth's tables, so the plugin keeps issuing, rotating and revoking
-- tokens the same way for both kinds.
--
-- An agency grant answers only while its person is an active member of the
-- partner, and the partner is active. The MCP server reads their role on
-- every request, so removing them or changing their role takes effect on the
-- next request. app.resolve_oauth_access_token never answers an agency
-- token, since no business has 'partner:<id>' as its id.

/** The partner an OAuth reference names, or null for a business grant or anything else. */
CREATE OR REPLACE FUNCTION app.oauth_reference_partner_id(p_reference_id text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_reference_id ~ '^partner:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN substring(p_reference_id FROM 9)::uuid
  END
$$;
REVOKE ALL ON FUNCTION app.oauth_reference_partner_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.oauth_reference_partner_id(text) TO lobbystack_app, lobbystack_worker, lobbystack_readonly;

-- MCP requests arrive without a tenant context. This resolver maps an access
-- token hash to its agency grant, its partner, and the person's role on the
-- partner's team now. It returns nothing when the token is revoked or
-- expired, the grant was revoked, the client is disabled, the partner isn't
-- active, or the person is no longer on the partner's team.
CREATE OR REPLACE FUNCTION app.resolve_partner_oauth_access_token(p_token_hash text)
RETURNS TABLE (partner_id uuid, grant_id text, user_id uuid, partner_role text, client_id text, client_name text, scopes text[], resources text[], expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT partner.id, consent.id, token.user_id, member.role::text, token.client_id, client.name,
    ARRAY(SELECT scope FROM unnest(token.scopes) AS scope WHERE scope = ANY (consent.scopes)),
    token.resources, token.expires_at
  FROM public.oauth_access_tokens token
  JOIN public.oauth_consents consent
    ON consent.client_id = token.client_id AND consent.user_id = token.user_id AND consent.reference_id = token.reference_id
  JOIN public.oauth_clients client ON client.client_id = token.client_id
  JOIN public.partners partner ON partner.id = app.oauth_reference_partner_id(token.reference_id)
  JOIN public.partner_members member
    ON member.partner_id = partner.id AND member.user_id = token.user_id
  WHERE token.token = p_token_hash
    AND token.revoked IS NULL
    AND token.expires_at > now()
    AND COALESCE(client.disabled, false) = false
    AND partner.status = 'active'
    AND member.status = 'active'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.resolve_partner_oauth_access_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_partner_oauth_access_token(text) TO lobbystack_worker;

-- The console's API keys page lists a partner's agency connections and
-- disconnects them, with the app role. Owners and admins see every one of
-- the partner's; anyone sees and disconnects their own.
CREATE OR REPLACE FUNCTION app.can_manage_partner_oauth_reference(target_reference_id text, grantor_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT app.oauth_reference_partner_id(target_reference_id) IS NOT NULL
    AND app.current_actor_type() = 'operator'
    AND app.current_user_id() IS NOT NULL
    AND (
      grantor_user_id = app.current_user_id()
      OR app.partner_role(app.oauth_reference_partner_id(target_reference_id)) IN ('owner', 'admin')
    )
$$;
REVOKE ALL ON FUNCTION app.can_manage_partner_oauth_reference(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_manage_partner_oauth_reference(text, uuid) TO lobbystack_app;

DROP POLICY IF EXISTS oauth_consents_partner ON public.oauth_consents;
CREATE POLICY oauth_consents_partner ON public.oauth_consents TO lobbystack_app
  USING (app.can_manage_partner_oauth_reference(reference_id, user_id))
  WITH CHECK (app.can_manage_partner_oauth_reference(reference_id, user_id));

DROP POLICY IF EXISTS oauth_access_tokens_partner ON public.oauth_access_tokens;
CREATE POLICY oauth_access_tokens_partner ON public.oauth_access_tokens TO lobbystack_app
  USING (app.can_manage_partner_oauth_reference(reference_id, user_id))
  WITH CHECK (app.can_manage_partner_oauth_reference(reference_id, user_id));

DROP POLICY IF EXISTS oauth_refresh_tokens_partner ON public.oauth_refresh_tokens;
CREATE POLICY oauth_refresh_tokens_partner ON public.oauth_refresh_tokens TO lobbystack_app
  USING (app.can_manage_partner_oauth_reference(reference_id, user_id))
  WITH CHECK (app.can_manage_partner_oauth_reference(reference_id, user_id));

DROP POLICY IF EXISTS oauth_clients_partner ON public.oauth_clients;
CREATE POLICY oauth_clients_partner ON public.oauth_clients FOR SELECT TO lobbystack_app
  USING (EXISTS (SELECT 1 FROM public.oauth_consents consent WHERE consent.client_id = oauth_clients.client_id AND app.can_manage_partner_oauth_reference(consent.reference_id, consent.user_id)));

-- Who made each agency connection. users_self_access shows the app role only
-- its own users row, so the console reads the names here: only someone on
-- the partner's team, and only for people who hold one of its grants.
CREATE OR REPLACE FUNCTION app.list_partner_oauth_grantors(p_partner_id uuid)
RETURNS TABLE (user_id uuid, name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT person.id, person.name, person.email
  FROM public.oauth_consents consent
  JOIN public.users person ON person.id = consent.user_id
  WHERE consent.reference_id = 'partner:' || p_partner_id::text
    -- Inside SECURITY DEFINER current_user is the owner; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'operator'
    AND app.partner_role(p_partner_id) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app.list_partner_oauth_grantors(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_partner_oauth_grantors(uuid) TO lobbystack_app;

-- What happened to the partner itself, rather than to one of its businesses,
-- whose audit_logs go with the business. It starts with agency connections:
-- oauth_grant.approved and oauth_grant.revoked. The partner's owners and
-- admins read it, and someone on the team writes their own rows.
CREATE TABLE IF NOT EXISTS public.partner_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type varchar(64) NOT NULL,
  entity_type varchar(64) NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_audit_logs_partner_idx ON public.partner_audit_logs (partner_id, created_at);

ALTER TABLE public.partner_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_audit_logs_read ON public.partner_audit_logs;
CREATE POLICY partner_audit_logs_read ON public.partner_audit_logs FOR SELECT TO lobbystack_app
  USING (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS partner_audit_logs_write ON public.partner_audit_logs;
CREATE POLICY partner_audit_logs_write ON public.partner_audit_logs FOR INSERT TO lobbystack_app
  WITH CHECK (
    app.current_actor_type() = 'operator'
    AND app.current_user_id() IS NOT NULL
    AND actor_user_id = app.current_user_id()
    AND app.partner_role(partner_id) IS NOT NULL
  );

GRANT SELECT, INSERT ON public.partner_audit_logs TO lobbystack_app;
GRANT SELECT ON public.partner_audit_logs TO lobbystack_readonly;
