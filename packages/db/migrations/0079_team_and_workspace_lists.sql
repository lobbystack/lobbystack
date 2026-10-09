-- The team page lists a business's members with their names and emails.
-- users_self_access lets the app role read only its own users row, so a join
-- from business_memberships drops every other member. This function answers
-- only an operator who belongs to the business in their RLS context, and
-- returns only active members.
CREATE OR REPLACE FUNCTION app.list_business_members(p_business_id uuid)
RETURNS TABLE (membership_id uuid, user_id uuid, name text, email text, role varchar, status varchar, joined_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT membership.id, person.id, person.name, person.email, membership.role, membership.status, membership.created_at
  FROM public.business_memberships membership
  JOIN public.users person ON person.id = membership.user_id
  WHERE membership.business_id = p_business_id
    AND membership.status = 'active'
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'operator'
    AND app.current_business_id() = p_business_id
    AND app.has_business_membership(p_business_id)
  ORDER BY membership.created_at, membership.id
$$;

REVOKE ALL ON FUNCTION app.list_business_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_business_members(uuid) TO lobbystack_app;

-- The workspace list also needs each business's settings. The businesses RLS
-- policy shows one business per app.business_id, so reading them took two
-- queries per business. Return them here. Adding columns changes the result
-- type, which CREATE OR REPLACE can't do.
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
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.slug, membership.role,
    business.timezone, business.business_type, business.default_locale,
    business.website_url, business.onboarding_stage, business.created_at
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
