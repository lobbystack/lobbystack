-- One-off repair for demos closed before 0071. Revoking or expiring a demo left
-- the operator's business_owner membership active, so closed demo businesses
-- stayed in the operator's workspace switcher and one became its active
-- workspace. Mark those memberships 'removed' and clear any active business
-- that points at one.
--
-- Scope: demos that are revoked, or past expiry and not yet swept, that no one
-- claimed. Claiming already removed the operator's membership but left the
-- operator's active business pointing at the claimed demo, so clear that too
-- when the operator has no active membership there. Businesses, demos, and the
-- claimant's membership are left as they are. Every
-- statement is guarded on the state it changes, so running this file again
-- changes nothing. Counts are reported as notices; the migrator prints them.
--
-- The repair needs a role that sees every row. Under row-level security the
-- updates would match nothing, so any other role skips it with a notice.
-- Production migrates as the table owner's superuser.

DO $$
DECLARE
  detached integer;
  cleared integer;
  cleared_claimed integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE NOTICE 'Skipping the closed prospect demo repair: % is subject to row-level security.', current_user;
    RETURN;
  END IF;

  WITH closed AS (
    SELECT demo.business_id, demo.operator_user_id
    FROM public.prospect_demos demo
    WHERE demo.claimed_by_user_id IS NULL
      AND demo.status <> 'claimed'
      AND (demo.status = 'revoked' OR demo.expires_at <= now())
  )
  UPDATE public.business_memberships membership
  SET status = 'removed', updated_at = now()
  FROM closed
  WHERE membership.business_id = closed.business_id
    AND membership.user_id = closed.operator_user_id
    AND membership.status = 'active';
  GET DIAGNOSTICS detached = ROW_COUNT;

  WITH closed AS (
    SELECT demo.business_id, demo.operator_user_id
    FROM public.prospect_demos demo
    WHERE demo.claimed_by_user_id IS NULL
      AND demo.status <> 'claimed'
      AND (demo.status = 'revoked' OR demo.expires_at <= now())
  )
  UPDATE public.users u
  SET active_business_id = NULL, updated_at = now()
  FROM closed
  WHERE u.id = closed.operator_user_id
    AND u.active_business_id = closed.business_id;
  GET DIAGNOSTICS cleared = ROW_COUNT;

  UPDATE public.users u
  SET active_business_id = NULL, updated_at = now()
  FROM public.prospect_demos demo
  WHERE demo.status = 'claimed'
    AND demo.claimed_by_user_id IS NOT NULL
    AND demo.claimed_by_user_id <> demo.operator_user_id
    AND u.id = demo.operator_user_id
    AND u.active_business_id = demo.business_id
    AND NOT EXISTS (
      SELECT 1 FROM public.business_memberships membership
      WHERE membership.business_id = demo.business_id
        AND membership.user_id = u.id
        AND membership.status = 'active'
    );
  GET DIAGNOSTICS cleared_claimed = ROW_COUNT;

  RAISE NOTICE 'Closed prospect demos: % operator memberships removed, % active businesses cleared, % active businesses cleared on claimed demos.', detached, cleared, cleared_claimed;
END
$$;
