-- GET /v1/businesses lists the businesses a platform key's partner onboarded.
-- The request has no business context, and both platform_partner_businesses
-- and businesses are tenant-isolated, so this resolver reads one partner's
-- active businesses, newest first, one page at a time. Only the worker role,
-- which serves /api/v1, may call it.
CREATE OR REPLACE FUNCTION app.list_platform_partner_businesses(p_partner_id text, p_before_created timestamptz, p_before_id uuid, p_limit integer)
RETURNS TABLE (business_id uuid, name text, timezone varchar, default_locale varchar, website_url text, onboarding_stage varchar, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.timezone, business.default_locale, business.website_url, business.onboarding_stage, business.created_at
  FROM public.platform_partner_businesses link
  JOIN public.businesses business ON business.id = link.business_id
  WHERE link.partner_id = p_partner_id
    AND business.status = 'active'
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_worker can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'worker'
    -- Keyset paging on the millisecond value, as the API's cursors carry it.
    AND (p_before_created IS NULL OR (date_trunc('milliseconds', business.created_at), business.id) < (p_before_created, p_before_id))
  ORDER BY date_trunc('milliseconds', business.created_at) DESC, business.id DESC
  -- The API bounds the page size; this only refuses a zero or negative limit.
  LIMIT GREATEST(p_limit, 1)
$$;

REVOKE ALL ON FUNCTION app.list_platform_partner_businesses(text, timestamptz, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_platform_partner_businesses(text, timestamptz, uuid, integer) TO lobbystack_worker;
