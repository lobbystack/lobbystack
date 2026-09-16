CREATE OR REPLACE FUNCTION app.resolve_business_by_phone(phone_e164 text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business_id FROM public.phone_numbers WHERE e164 = phone_e164 AND status = 'active' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_business_by_call(p_provider_call_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business_id FROM public.calls WHERE provider_call_id = p_provider_call_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_business_by_call_id(p_call_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business_id FROM public.calls WHERE id = p_call_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_business_by_gateway_session(p_gateway_session_id text)
RETURNS TABLE (call_id uuid, business_id uuid, provider_call_id text, started_at timestamptz, ended_at timestamptz, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT id, business_id, provider_call_id, started_at, ended_at, status
  FROM public.calls
  WHERE gateway_session_id = p_gateway_session_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_business_by_message(p_provider_message_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business_id FROM public.messages WHERE provider_message_id = p_provider_message_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_business_by_slug(p_business_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT id FROM public.businesses WHERE slug = p_business_slug AND status = 'active' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_business_by_invitation(p_token_hash text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business_id FROM public.business_invitations WHERE token_hash = p_token_hash AND status = 'pending' AND expires_at > now() LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_business_by_call(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_business_by_call_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_business_by_gateway_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_business_by_message(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_business_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_business_by_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_phone(text) TO lobbystack_app, lobbystack_worker;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_call(text) TO lobbystack_app, lobbystack_worker;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_call_id(uuid) TO lobbystack_app, lobbystack_worker;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_gateway_session(text) TO lobbystack_app, lobbystack_worker;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_message(text) TO lobbystack_app, lobbystack_worker;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_slug(text) TO lobbystack_app, lobbystack_worker;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_invitation(text) TO lobbystack_app;
