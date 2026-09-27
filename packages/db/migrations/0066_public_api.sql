-- Public REST API keys and outbound webhooks.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  -- Shown in the dashboard so people can recognise a key: lsk_ plus a short id.
  prefix varchar(32) NOT NULL,
  -- SHA-256 of the full key. The plaintext key is never stored.
  key_hash text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_scopes_array CHECK (jsonb_typeof(scopes) = 'array')
);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_unique ON public.api_keys(key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_prefix_unique ON public.api_keys(prefix);
CREATE INDEX IF NOT EXISTS api_keys_business_created_idx ON public.api_keys(business_id, created_at);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  url text NOT NULL,
  description varchar(200),
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- AES-256-GCM ciphertext of the whsec_ signing secret, keyed by ENCRYPTION_KEY.
  encrypted_secret text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'enabled',
  disabled_reason varchar(16),
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_endpoints_status_check CHECK (status IN ('enabled', 'disabled')),
  CONSTRAINT webhook_endpoints_disabled_reason_check CHECK (disabled_reason IS NULL OR disabled_reason IN ('manual', 'failing')),
  CONSTRAINT webhook_endpoints_events_array CHECK (jsonb_typeof(events) = 'array')
);
CREATE INDEX IF NOT EXISTS webhook_endpoints_business_status_idx ON public.webhook_endpoints(business_id, status);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type varchar(64) NOT NULL,
  -- The complete signed body: { id, type, api_version, created_at, business_id, data }.
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_events_business_created_idx ON public.webhook_events(business_id, created_at);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.webhook_events(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  last_response_status integer,
  last_error text,
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_status_check CHECK (status IN ('pending', 'retrying', 'succeeded', 'failed', 'skipped'))
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_created_idx ON public.webhook_deliveries(endpoint_id, created_at);
CREATE INDEX IF NOT EXISTS webhook_deliveries_business_created_idx ON public.webhook_deliveries(business_id, created_at);
CREATE INDEX IF NOT EXISTS webhook_deliveries_event_idx ON public.webhook_deliveries(event_id);

CREATE TABLE IF NOT EXISTS public.webhook_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.webhook_deliveries(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  response_status integer,
  error text,
  duration_ms integer,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_delivery_attempts_delivery_number_unique ON public.webhook_delivery_attempts(delivery_id, attempt_number);
CREATE INDEX IF NOT EXISTS webhook_delivery_attempts_business_created_idx ON public.webhook_delivery_attempts(business_id, created_at);

-- Messages the receptionist takes keep their structured fields for the API.
ALTER TABLE public.inbox_items ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Idempotency keys expire after 24 hours; the retention job deletes by age.
CREATE INDEX IF NOT EXISTS idempotency_business_created_idx ON public.idempotency_keys(business_id, created_at);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['api_keys', 'webhook_endpoints', 'webhook_events', 'webhook_deliveries', 'webhook_delivery_attempts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON public.%I USING (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id))) WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id)))',
      table_name, table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_app, lobbystack_worker', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO lobbystack_readonly', table_name);
  END LOOP;
END
$$;

-- API requests arrive without a tenant context. This resolver maps a key hash
-- to its business so the request can then run inside that business's RLS
-- context. It returns nothing for revoked keys or inactive businesses.
CREATE OR REPLACE FUNCTION app.resolve_api_key(p_key_hash text)
RETURNS TABLE (business_id uuid, api_key_id uuid, scopes jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT key.business_id, key.id, key.scopes
  FROM public.api_keys key
  JOIN public.businesses business ON business.id = key.business_id
  WHERE key.key_hash = p_key_hash
    AND key.revoked_at IS NULL
    AND business.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_api_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_api_key(text) TO lobbystack_app, lobbystack_worker;
