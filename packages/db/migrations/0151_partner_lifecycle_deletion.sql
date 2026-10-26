-- Ninety days after a partner's paid tier ended, the host deletes the
-- businesses the partner had by then, as the partner deleting each one would:
-- everything in it goes, and each number it held goes back to the provider
-- through phoneNumber.releaseDeleted. A business that still pays for its
-- package through the partner's Stripe has its subscription cancelled first,
-- so its owner pays nothing more for a business that's gone. The hourly
-- partnerLifecycle.advance job in the worker does it, one business per
-- transaction, right after it moves the partner to deleted, and again each
-- hour for any business that had to wait, such as one whose number is still
-- being bought. Each deletion goes to partner_lifecycle_events, which outlives
-- the business.

-- The businesses the host deletes now: those of each partner that reached
-- deletion, made by the time it did, oldest first. A business the partner
-- makes later answers as any Free partner's does. The worker deletes each one
-- with the business in its context, but RLS shows it no business before
-- that, so this reads them as its owner, for the worker only. `skip` leaves
-- out the ones this run already tried.
CREATE OR REPLACE FUNCTION app.partner_businesses_due_for_deletion(p_limit integer, p_skip uuid[])
RETURNS TABLE (partner_id uuid, business_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.partner_id, business.id
  FROM public.partner_lifecycles lifecycle
  JOIN public.businesses business ON business.partner_id = lifecycle.partner_id
  WHERE session_user = 'lobbystack_worker'
    AND lifecycle.state = 'deleted'
    AND business.created_at <= lifecycle.since
    AND NOT (business.id = ANY (COALESCE(p_skip, ARRAY[]::uuid[])))
  ORDER BY lifecycle.since, business.created_at, business.id
  LIMIT LEAST(GREATEST(p_limit, 1), 500)
$$;
REVOKE ALL ON FUNCTION app.partner_businesses_due_for_deletion(integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_businesses_due_for_deletion(integer, uuid[]) TO lobbystack_worker;

-- Whether a number is being bought for the business right now, as 0137
-- defined it. It also answers the worker inside the business, which deletes
-- it as the partner's lifecycle ends and waits the same way.
CREATE OR REPLACE FUNCTION app.business_number_claim_in_progress(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.onboarding_number_claim_events claim
    WHERE claim.business_id = p_business_id
      AND (
        (claim.status = 'reserved' AND claim.reserved_at > now() - interval '15 minutes')
        OR (claim.status = 'provisioning' AND claim.updated_at > now() - interval '30 minutes')
      )
  )
    AND (
      app.partner_role(app.business_partner(p_business_id)) IS NOT NULL
      -- Inside SECURITY DEFINER current_user is the owner, so check the session and the caller's settings.
      OR (session_user = 'lobbystack_worker' AND current_setting('app.actor_type', true) = 'worker' AND p_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
    )
$$;
REVOKE ALL ON FUNCTION app.business_number_claim_in_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.business_number_claim_in_progress(uuid) TO lobbystack_app, lobbystack_worker;

-- Before it deletes a business that pays for its package, the worker checks
-- that the subscription is on the partner's connected account, which it can
-- still reach, as the partner's own delete does. Inside the business, it
-- reads that business's partner's account and nothing else.
DROP POLICY IF EXISTS partner_stripe_accounts_worker_read ON public.partner_stripe_accounts;
CREATE POLICY partner_stripe_accounts_worker_read ON public.partner_stripe_accounts FOR SELECT
  USING (app.current_actor_type() = 'worker' AND partner_id = app.business_partner(app.current_business_id()));
GRANT SELECT ON public.partner_stripe_accounts TO lobbystack_worker;
