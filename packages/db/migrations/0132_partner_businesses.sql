-- A partner creates each of its businesses in the console with no owner yet,
-- chooses the access level the business's own operators get, and invites the
-- owner. A person sees a partner's businesses only on that partner's domains,
-- and each brand remembers the business the person last worked in there.

-- The access level a partner's business gives its own operators: full
-- (today's owner and admin work, minus billing, API keys and MCP) or activity
-- (calls, chats, appointments, contacts and messages). Direct businesses
-- ignore it. A constant default adds the column without rewriting the table.
-- The check is NOT VALID, so this file doesn't read every business while it
-- holds the lock that blocks them; 0133 validates it under a lighter lock.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS partner_access_level varchar(16) NOT NULL DEFAULT 'full';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.businesses'::regclass AND conname = 'businesses_partner_access_level_check') THEN
    ALTER TABLE public.businesses ADD CONSTRAINT businesses_partner_access_level_check CHECK (partner_access_level IN ('full', 'activity')) NOT VALID;
  END IF;
END
$$;

-- Both runtime roles may update businesses, and a business's own operators
-- pass its RLS policy, so the database keeps them from raising their own
-- access level. Only the system actor, which partner operations run as,
-- changes it.
CREATE OR REPLACE FUNCTION app.keep_partner_access_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_user IN ('lobbystack_app', 'lobbystack_worker') AND app.current_actor_type() <> 'system' THEN
    RAISE EXCEPTION 'partner_access_level_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.keep_partner_access_level() FROM PUBLIC;

DROP TRIGGER IF EXISTS businesses_keep_partner_access_level_before_update ON public.businesses;
CREATE TRIGGER businesses_keep_partner_access_level_before_update
BEFORE UPDATE OF partner_access_level ON public.businesses
FOR EACH ROW
WHEN (OLD.partner_access_level IS DISTINCT FROM NEW.partner_access_level)
EXECUTE FUNCTION app.keep_partner_access_level();

-- The business a person last worked in on each partner's domains. The host's
-- own domain keeps users.active_business_id, so direct businesses work as
-- before. A row only ever names a business of its partner; whether the
-- person may still open it is checked each time it's read.
CREATE TABLE IF NOT EXISTS public.user_active_businesses (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_id)
);
-- Deleting a business deletes the rows that name it.
CREATE INDEX IF NOT EXISTS user_active_businesses_business_idx ON public.user_active_businesses (business_id);

ALTER TABLE public.user_active_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_active_businesses FORCE ROW LEVEL SECURITY;

-- A person reads and changes only their own rows: as an operator when they
-- open a business, or as the system actor when accepting an invitation opens
-- it for them.
DROP POLICY IF EXISTS user_active_businesses_self ON public.user_active_businesses;
CREATE POLICY user_active_businesses_self ON public.user_active_businesses
  USING (app.current_actor_type() IN ('operator', 'system') AND user_id = app.current_user_id())
  WITH CHECK (app.current_actor_type() IN ('operator', 'system') AND user_id = app.current_user_id() AND app.business_partner(business_id) = partner_id);

GRANT SELECT, INSERT, DELETE ON public.user_active_businesses TO lobbystack_app;
-- An update only moves the person to another business of the same partner.
GRANT UPDATE (business_id, updated_at) ON public.user_active_businesses TO lobbystack_app;
GRANT SELECT ON public.user_active_businesses TO lobbystack_readonly;

-- A partner's business is billed outside LobbyStack until packages arrive,
-- and no tier limits it yet, so it holds a live entitlement, as
-- loadEntitlement says in packages/domain. Until tiers count numbers, 0135
-- keeps the cloud from buying it any. A direct business keeps the rule 0127
-- set: a paid plan on a live subscription.
CREATE OR REPLACE FUNCTION app.has_live_entitlement(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses business WHERE business.id = target_business_id AND business.partner_id IS NOT NULL)
    OR COALESCE((
      SELECT account.plan IN ('starter', 'pro', 'enterprise') AND account.subscription_state IN ('active', 'trialing', 'past_due')
      FROM public.billing_accounts account
      WHERE account.business_id = target_business_id
    ), false)
$$;
REVOKE ALL ON FUNCTION app.has_live_entitlement(uuid) FROM PUBLIC;

-- The workspace list also says which partner each business belongs to, so
-- each domain lists only its own brand's businesses. Adding a column changes
-- the result type, which CREATE OR REPLACE can't do. Everything else is as
-- 0079 defined it.
DROP FUNCTION IF EXISTS app.list_user_businesses(uuid);

CREATE FUNCTION app.list_user_businesses(p_user_id uuid)
RETURNS TABLE (
  business_id uuid,
  name text,
  slug varchar,
  role varchar,
  timezone varchar,
  business_type varchar,
  default_locale varchar,
  website_url text,
  onboarding_stage varchar,
  created_at timestamptz,
  partner_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.slug, membership.role,
    business.timezone, business.business_type, business.default_locale,
    business.website_url, business.onboarding_stage, business.created_at,
    business.partner_id
  FROM public.business_memberships membership
  INNER JOIN public.businesses business ON business.id = membership.business_id
  WHERE membership.user_id = p_user_id
    AND p_user_id = app.current_user_id()
    AND membership.status = 'active'
    AND business.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.prospect_demos demo
      WHERE demo.business_id = business.id
        AND demo.operator_user_id = p_user_id
        AND demo.claimed_by_user_id IS DISTINCT FROM p_user_id
        AND (demo.status IN ('revoked', 'claimed') OR demo.expires_at <= now())
    )
  ORDER BY business.name
$$;

REVOKE ALL ON FUNCTION app.list_user_businesses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_user_businesses(uuid) TO lobbystack_app;

-- The console's Businesses page. A partner member has no membership in the
-- partner's businesses, so RLS shows them none of their rows; this answers
-- instead, only for an operator on the partner's team, with each business's
-- owner once they joined, or the owner it invited.
CREATE OR REPLACE FUNCTION app.list_partner_businesses(p_partner_id uuid)
RETURNS TABLE (
  business_id uuid,
  name text,
  access_level varchar,
  onboarding_stage varchar,
  created_at timestamptz,
  owner_email text,
  invited_email text,
  invitation_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.partner_access_level, business.onboarding_stage, business.created_at,
    owner.email, invitation.email, invitation.expires_at
  FROM public.businesses business
  LEFT JOIN LATERAL (
    SELECT person.email
    FROM public.business_memberships membership
    JOIN public.users person ON person.id = membership.user_id
    WHERE membership.business_id = business.id
      AND membership.role = 'business_owner'
      AND membership.status = 'active'
    ORDER BY membership.created_at, membership.id
    LIMIT 1
  ) owner ON true
  LEFT JOIN LATERAL (
    SELECT pending.email, pending.expires_at
    FROM public.business_invitations pending
    WHERE pending.business_id = business.id
      AND pending.role = 'business_owner'
      AND pending.status = 'pending'
      AND NOT pending.transfers_ownership
    ORDER BY pending.created_at DESC, pending.id
    LIMIT 1
  ) invitation ON true
  WHERE business.partner_id = p_partner_id
    AND business.status = 'active'
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'operator'
    AND app.partner_role(p_partner_id) IS NOT NULL
  ORDER BY business.name, business.id
$$;
REVOKE ALL ON FUNCTION app.list_partner_businesses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_partner_businesses(uuid) TO lobbystack_app;

-- A partner's businesses never get MCP. Their owners can't grant an MCP
-- client access, since the consent screen lists only direct businesses, and
-- this resolver answers no token for one either. Everything else is as 0069
-- defined it.
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
    AND business.partner_id IS NULL
    AND membership.status = 'active'
    AND membership.role IN ('business_owner', 'business_admin')
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_oauth_access_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_oauth_access_token(text) TO lobbystack_worker;
