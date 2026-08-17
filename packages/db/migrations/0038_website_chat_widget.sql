-- Embeddable website chat widget.
-- Phase A: relax contacts.phone, add widget_keys and widget_visitors, resolver.

ALTER TABLE public.contacts ALTER COLUMN phone DROP NOT NULL;

DROP INDEX IF EXISTS public.contacts_business_phone_unique;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_business_phone_unique
  ON public.contacts (business_id, phone)
  WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.widget_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  label varchar(120),
  status varchar(32) NOT NULL DEFAULT 'active',
  allowed_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT widget_keys_status_check CHECK (status IN ('active', 'disabled', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS widget_keys_key_hash_unique ON public.widget_keys(key_hash);
CREATE INDEX IF NOT EXISTS widget_keys_business_created_idx ON public.widget_keys(business_id, created_at);

CREATE TABLE IF NOT EXISTS public.widget_visitors (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  name text,
  email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS widget_visitors_business_last_seen_idx ON public.widget_visitors(business_id, last_seen_at);
CREATE INDEX IF NOT EXISTS widget_visitors_contact_idx ON public.widget_visitors(business_id, contact_id);

ALTER TABLE public.widget_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS widget_keys_tenant_isolation ON public.widget_keys;
CREATE POLICY widget_keys_tenant_isolation ON public.widget_keys
  USING (
    business_id = app.current_business_id()
    AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))
  )
  WITH CHECK (
    business_id = app.current_business_id()
    AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))
  );

ALTER TABLE public.widget_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_visitors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS widget_visitors_tenant_isolation ON public.widget_visitors;
CREATE POLICY widget_visitors_tenant_isolation ON public.widget_visitors
  USING (
    business_id = app.current_business_id()
    AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))
  )
  WITH CHECK (
    business_id = app.current_business_id()
    AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.widget_keys TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.widget_keys TO lobbystack_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.widget_visitors TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.widget_visitors TO lobbystack_readonly;

CREATE OR REPLACE FUNCTION app.resolve_business_by_widget_key(p_key_hash text)
RETURNS TABLE (business_id uuid, widget_key_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT key.business_id, key.id
  FROM public.widget_keys key
  JOIN public.businesses business ON business.id = key.business_id
  WHERE key.key_hash = p_key_hash
    AND key.status = 'active'
    AND business.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_widget_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_widget_key(text) TO lobbystack_app, lobbystack_worker;
