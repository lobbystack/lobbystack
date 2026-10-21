-- Platform API keys onboard and manage businesses for LobbyStack and its
-- partners. The keys live in the admin's PLATFORM_API_KEYS environment
-- variable. A key whose access is "partner" reaches only the businesses linked
-- to its partner here; a key whose access is "all" reaches every business.
CREATE TABLE IF NOT EXISTS public.platform_partner_businesses (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- The partner slug from PLATFORM_API_KEYS, for example alloplace.
  partner_id varchar(40) NOT NULL,
  -- The PLATFORM_API_KEYS entry that linked the business. Keys are not rows,
  -- so this has no foreign key.
  created_by_platform_key_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, partner_id)
);
CREATE INDEX IF NOT EXISTS platform_partner_businesses_partner_idx ON public.platform_partner_businesses(partner_id, created_at);

ALTER TABLE public.platform_partner_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_partner_businesses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_partner_businesses_tenant_isolation ON public.platform_partner_businesses;
-- Members can see which partners manage their business. Only the API, which
-- runs as the worker, links or unlinks one.
CREATE POLICY platform_partner_businesses_tenant_isolation ON public.platform_partner_businesses
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND app.current_actor_type() IN ('system', 'worker'));
GRANT SELECT ON public.platform_partner_businesses TO lobbystack_app, lobbystack_readonly;
GRANT SELECT, INSERT, DELETE ON public.platform_partner_businesses TO lobbystack_worker;

-- A platform key acts as the account named by its owner_email. API requests
-- arrive with no user context, so this resolver maps that email to the user
-- id. Only a verified email counts, so nobody can claim a key's identity by
-- signing up with its owner_email first. Only the worker role, which serves
-- /api/v1, may call it.
CREATE OR REPLACE FUNCTION app.resolve_platform_key_owner(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT person.id
  FROM public.users person
  WHERE person.normalized_email = lower(btrim(p_email))
    AND person.email_verified
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_platform_key_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_platform_key_owner(text) TO lobbystack_worker;
