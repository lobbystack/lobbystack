-- Creating a prospect demo gives the demo operator a business_owner membership
-- on the demo business so it can prepare the demo. Claiming a demo removed that
-- membership, but revoking or expiring one did not, so closed demos stayed in
-- the operator's workspace switcher and could become its active workspace.
--
-- The operator does not need the membership once a demo closes: the operator
-- demo list and status reads resolve demos by prospect_demos.operator_user_id
-- through SECURITY DEFINER resolvers and run as the system actor, and closed
-- demos cannot be published or re-sent. Closing a demo now marks the operator's
-- membership 'removed' (the status removeMember uses) and clears the operator's
-- active business when it points at the demo. Rows are kept for audit lineage.

-- Detaches the operator from the demo on the business bound to the calling
-- transaction. It acts only on a closed demo (revoked, claimed, or past its
-- expiry) and never on one the operator claimed for itself, so a caller cannot
-- use it to remove access the demo lifecycle would keep. Returns the number of
-- memberships it deactivated.
CREATE OR REPLACE FUNCTION app.detach_prospect_demo_operator(p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  demo record;
  detached integer;
BEGIN
  IF p_business_id IS DISTINCT FROM app.current_business_id() THEN
    RETURN 0;
  END IF;

  SELECT d.business_id, d.operator_user_id INTO demo
  FROM public.prospect_demos d
  WHERE d.business_id = p_business_id
    AND (d.status IN ('revoked', 'claimed') OR d.expires_at <= now())
    AND d.claimed_by_user_id IS DISTINCT FROM d.operator_user_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE public.business_memberships
  SET status = 'removed', updated_at = now()
  WHERE business_id = demo.business_id
    AND user_id = demo.operator_user_id
    AND status = 'active';
  GET DIAGNOSTICS detached = ROW_COUNT;

  UPDATE public.users
  SET active_business_id = NULL, updated_at = now()
  WHERE id = demo.operator_user_id
    AND active_business_id = demo.business_id;

  RETURN detached;
END
$$;

REVOKE ALL ON FUNCTION app.detach_prospect_demo_operator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.detach_prospect_demo_operator(uuid) TO lobbystack_app;

-- The worker's expiry sweep detaches the operator from each demo it closes.
-- Data-modifying CTEs always run to completion, so the membership and user
-- updates apply even though the final SELECT reads only the expired rows.
CREATE OR REPLACE FUNCTION app.expire_prospect_demos()
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH expired AS (
    UPDATE public.prospect_demos
    SET status = 'revoked', updated_at = now()
    WHERE status IN ('preparing', 'active') AND expires_at <= now()
    RETURNING business_id, operator_user_id
  ),
  detached AS (
    UPDATE public.business_memberships membership
    SET status = 'removed', updated_at = now()
    FROM expired
    WHERE membership.business_id = expired.business_id
      AND membership.user_id = expired.operator_user_id
      AND membership.status = 'active'
    RETURNING membership.id
  ),
  cleared AS (
    UPDATE public.users u
    SET active_business_id = NULL, updated_at = now()
    FROM expired
    WHERE u.id = expired.operator_user_id
      AND u.active_business_id = expired.business_id
    RETURNING u.id
  )
  SELECT count(*) FROM expired
$$;

REVOKE ALL ON FUNCTION app.expire_prospect_demos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.expire_prospect_demos() TO lobbystack_worker;

-- The workspace switcher and the onboarding fallback list a user's businesses
-- through this resolver. Leave out demos the user operated that have closed,
-- including ones past expiry that the hourly sweep has not revoked yet.
CREATE OR REPLACE FUNCTION app.list_user_businesses(p_user_id uuid)
RETURNS TABLE (business_id uuid, name text, slug varchar, role varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.slug, membership.role
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
