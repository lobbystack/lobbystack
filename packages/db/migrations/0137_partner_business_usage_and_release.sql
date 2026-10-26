-- The console's Businesses page shows each business's minutes and chats this
-- month, and a partner can release a business to its owner or delete it.

-- A partner member has no membership in the partner's businesses, so RLS
-- shows them none of their usage; this answers instead, as
-- app.list_partner_businesses (0132) does, only for an operator on the
-- partner's team. The month's row holds what usage metering last counted,
-- which every reservation, top-up and correction refreshes. A business with
-- no usage that month has no row and answers zero.
CREATE OR REPLACE FUNCTION app.list_partner_business_usage(p_partner_id uuid, p_period_key text)
RETURNS TABLE (
  business_id uuid,
  voice_seconds_used double precision,
  chats_used double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, COALESCE(month.voice_seconds_used, 0), COALESCE(month.chat_ai_tokens_used, 0)
  FROM public.businesses business
  LEFT JOIN public.billing_usage_months month ON month.business_id = business.id AND month.period_key = p_period_key
  WHERE business.partner_id = p_partner_id
    AND business.status = 'active'
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'operator'
    AND app.partner_role(p_partner_id) IS NOT NULL
  ORDER BY business.id
$$;
REVOKE ALL ON FUNCTION app.list_partner_business_usage(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_partner_business_usage(uuid, text) TO lobbystack_app;

-- When a business leaves its partner, which only releasing it does (0135),
-- the database forgets what the partner's people kept of it: their opens of
-- it (0136), which no longer count, and the rows that make it the business
-- they work in on the partner's domains (0132), which the partner's domains
-- no longer show. The audit log keeps every open. The app role reads and
-- deletes only its own remembered business and deletes no open, so this runs
-- as the tables' owner.
CREATE OR REPLACE FUNCTION app.forget_partner_business_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  DELETE FROM public.partner_business_opens WHERE business_id = NEW.id AND partner_id = OLD.partner_id;
  DELETE FROM public.user_active_businesses WHERE business_id = NEW.id AND partner_id = OLD.partner_id;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION app.forget_partner_business_access() FROM PUBLIC;

DROP TRIGGER IF EXISTS businesses_forget_partner_access_after_update ON public.businesses;
CREATE TRIGGER businesses_forget_partner_access_after_update
AFTER UPDATE OF partner_id ON public.businesses
FOR EACH ROW
WHEN (OLD.partner_id IS NOT NULL AND OLD.partner_id IS DISTINCT FROM NEW.partner_id)
EXECUTE FUNCTION app.forget_partner_business_access();

-- A partner's people work in its businesses through opens and never join
-- their teams, so the team list holds only the business's own operators.
-- Inviting one of them onto a team of the partner's businesses, or making one
-- a business's owner, is refused, and this says whether an address belongs to
-- someone on the partner's team. users_self_access lets the app role read only
-- its own users row, so this answers instead, and only someone on that
-- partner's team, who sees its members anyway (app.list_partner_members,
-- 0128). Accepting the invitation checks the person themselves.
CREATE OR REPLACE FUNCTION app.is_partner_member_email(p_partner_id uuid, p_normalized_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_members member
    JOIN public.users person ON person.id = member.user_id
    WHERE member.partner_id = p_partner_id
      AND member.status = 'active'
      AND person.normalized_email = p_normalized_email
  )
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) IN ('operator', 'system')
    AND app.partner_role(p_partner_id) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app.is_partner_member_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_partner_member_email(uuid, text) TO lobbystack_app;

-- Whether the business still exists. The worker sends a queued email after
-- the fact, with no business in its context, and a business deleted since
-- then has no one left to write to: app.business_partner answers null for it
-- as for a direct business, which would send it under the host's brand.
CREATE OR REPLACE FUNCTION app.business_exists(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses business WHERE business.id = p_business_id)
$$;
REVOKE ALL ON FUNCTION app.business_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.business_exists(uuid) TO lobbystack_app, lobbystack_worker;

-- Whether a number is being bought for the business right now: a claim
-- reserved in the last 15 minutes, or one a worker moved on in the last 30.
-- After those ages the claim functions treat a claim as abandoned. Deleting
-- a partner's business waits while one is under way, since the purchase
-- would finish for a business that's gone. The partner's people aren't on
-- the business's team, so RLS shows them none of its claims; this answers
-- instead, and only someone on the business's partner's team.
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
    AND app.partner_role(app.business_partner(p_business_id)) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app.business_number_claim_in_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.business_number_claim_in_progress(uuid) TO lobbystack_app;
