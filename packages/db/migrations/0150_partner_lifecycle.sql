-- What happens to a partner's businesses after its paid tier ends. When the
-- tier is cancelled or a payment fails, the businesses keep answering for 30
-- days, while the partner can release them. Then they pause: they get no
-- allowance, so calls forward and chat shows its "can't reply" message. The
-- host deletes them 90 days after the tier ended. A partner that pays for a
-- tier again is active again. nextPartnerState in packages/domain decides each
-- step; the worker applies it when it reconciles Polar's events for the
-- partner, and each hour for the steps the clock takes.

-- Where the partner stands: active, past_due after a failed payment, ending
-- once the tier ended, paused, or deleted. `since` is when it got there,
-- except while past_due or ending, when it's when the 30 days began: the
-- failed payment or the tier's end, whichever came first. `tier_ended_at` is
-- when the paid tier ended, which the 90 days count from, or null while it
-- hasn't: a past_due tier Polar is still retrying is in force. A partner with
-- no row is active, as every partner is until a paid tier ends.
CREATE TABLE IF NOT EXISTS public.partner_lifecycles (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  state varchar(16) NOT NULL CHECK (state IN ('active', 'past_due', 'ending', 'paused', 'deleted')),
  since timestamptz NOT NULL,
  tier_ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Only a past_due tier, or one paused while past_due, hasn't ended yet.
  CONSTRAINT partner_lifecycles_tier_ended_check CHECK (
    (state = 'active' AND tier_ended_at IS NULL)
    OR (state = 'past_due' AND tier_ended_at IS NULL)
    OR (state IN ('ending', 'deleted') AND tier_ended_at IS NOT NULL)
    OR state = 'paused'
  )
);
-- The hourly job looks for partners the clock moves on, and for partners that
-- reached deletion and still have businesses to delete.
CREATE INDEX IF NOT EXISTS partner_lifecycles_state_since_idx ON public.partner_lifecycles (state, since) WHERE state IN ('past_due', 'ending', 'paused', 'deleted');

ALTER TABLE public.partner_lifecycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_lifecycles FORCE ROW LEVEL SECURITY;

-- The partner's team reads where it stands. Only the worker moves it.
DROP POLICY IF EXISTS partner_lifecycles_read ON public.partner_lifecycles;
CREATE POLICY partner_lifecycles_read ON public.partner_lifecycles FOR SELECT
  USING (app.current_actor_type() IN ('system', 'worker') OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IS NOT NULL));
DROP POLICY IF EXISTS partner_lifecycles_worker_insert ON public.partner_lifecycles;
CREATE POLICY partner_lifecycles_worker_insert ON public.partner_lifecycles FOR INSERT
  WITH CHECK (app.current_actor_type() = 'worker');
DROP POLICY IF EXISTS partner_lifecycles_worker_update ON public.partner_lifecycles;
CREATE POLICY partner_lifecycles_worker_update ON public.partner_lifecycles FOR UPDATE
  USING (app.current_actor_type() = 'worker')
  WITH CHECK (app.current_actor_type() = 'worker');

GRANT SELECT ON public.partner_lifecycles TO lobbystack_app, lobbystack_readonly;
GRANT SELECT, INSERT ON public.partner_lifecycles TO lobbystack_worker;
-- A step moves the state and its times, never the partner.
GRANT UPDATE (state, since, tier_ended_at, updated_at) ON public.partner_lifecycles TO lobbystack_worker;

-- Every step a partner took, and every business the host deleted at the end,
-- by partner. A business's own audit log records the steps too, but it goes
-- with the business, so this is the record that outlives it. Rows are only
-- ever added.
CREATE TABLE IF NOT EXISTS public.partner_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  event_type varchar(64) NOT NULL CHECK (event_type IN ('partner.lifecycle_changed', 'partner.business_deleted')),
  -- The business the host deleted. It has no foreign key, since the row outlives the business.
  business_id uuid,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_lifecycle_events_business_check CHECK ((event_type = 'partner.business_deleted') = (business_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS partner_lifecycle_events_partner_idx ON public.partner_lifecycle_events (partner_id, created_at);

ALTER TABLE public.partner_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_lifecycle_events FORCE ROW LEVEL SECURITY;

-- The partner's team reads its record. Only the worker writes it.
DROP POLICY IF EXISTS partner_lifecycle_events_read ON public.partner_lifecycle_events;
CREATE POLICY partner_lifecycle_events_read ON public.partner_lifecycle_events FOR SELECT
  USING (app.current_actor_type() IN ('system', 'worker') OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IS NOT NULL));
DROP POLICY IF EXISTS partner_lifecycle_events_worker_insert ON public.partner_lifecycle_events;
CREATE POLICY partner_lifecycle_events_worker_insert ON public.partner_lifecycle_events FOR INSERT
  WITH CHECK (app.current_actor_type() = 'worker');

GRANT SELECT ON public.partner_lifecycle_events TO lobbystack_app, lobbystack_readonly;
GRANT SELECT, INSERT ON public.partner_lifecycle_events TO lobbystack_worker;

-- Whether a business of the partner answers, from where the partner stands:
-- in every state but paused and deleted. Once the partner reached deletion,
-- the host deletes the businesses it had by then, and one it makes later
-- answers as any Free partner's business does. Only the functions below call
-- this, as their owner.
CREATE OR REPLACE FUNCTION app.partner_business_lifecycle_answers(p_partner_id uuid, p_created_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT lifecycle.state IN ('active', 'past_due', 'ending') OR (lifecycle.state = 'deleted' AND p_created_at > lifecycle.since)
    FROM public.partner_lifecycles lifecycle
    WHERE lifecycle.partner_id = p_partner_id
  ), true)
$$;
REVOKE ALL ON FUNCTION app.partner_business_lifecycle_answers(uuid, timestamptz) FROM PUBLIC;

-- Whether a partner's business answers now, for loadEntitlement in
-- packages/domain. RLS shows a business's own operators nothing of its
-- partner, so this reads as its owner. It answers inside the business, or
-- for an operator on the partner's team, and is null for anyone else and for
-- a direct business.
CREATE OR REPLACE FUNCTION app.partner_business_answers(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  SELECT app.partner_business_lifecycle_answers(business.partner_id, business.created_at)
  FROM public.businesses business
  WHERE business.id = target_business_id
    AND business.partner_id IS NOT NULL
    AND (
      target_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
      -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
      -- would read 'none'; read the setting.
      OR (current_setting('app.actor_type', true) = 'operator' AND app.partner_role(business.partner_id) IS NOT NULL)
    )
$$;
REVOKE ALL ON FUNCTION app.partner_business_answers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_business_answers(uuid) TO lobbystack_app, lobbystack_worker;

-- Writes a step the worker just stored to the audit log of each of the
-- partner's businesses. The worker applies a step with no business in its
-- context, and RLS hides the partner's businesses from it, so this reads them
-- as its owner. It refuses a step that isn't the one stored, so the log never
-- records one that didn't happen. Returns how many businesses it wrote to.
CREATE OR REPLACE FUNCTION app.audit_partner_lifecycle_step(p_partner_id uuid, p_from varchar, p_to varchar, p_since timestamptz, p_event varchar)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE audited integer;
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's setting.
  IF NULLIF(current_setting('app.actor_type', true), '') IS DISTINCT FROM 'worker' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_lifecycles lifecycle WHERE lifecycle.partner_id = p_partner_id AND lifecycle.state = p_to AND lifecycle.since = p_since) THEN
    RAISE EXCEPTION 'partner_lifecycle_step_not_stored' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.audit_logs (business_id, event_type, entity_type, entity_id, payload)
  SELECT business.id, 'partner.lifecycle_changed', 'partner', p_partner_id, jsonb_build_object('partnerId', p_partner_id, 'from', p_from, 'to', p_to, 'since', to_char(p_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'event', p_event)
  FROM public.businesses business
  WHERE business.partner_id = p_partner_id;
  GET DIAGNOSTICS audited = ROW_COUNT;
  RETURN audited;
END $$;
REVOKE ALL ON FUNCTION app.audit_partner_lifecycle_step(uuid, varchar, varchar, timestamptz, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.audit_partner_lifecycle_step(uuid, varchar, varchar, timestamptz, varchar) TO lobbystack_worker;

-- A partner's business is live while it's billed outside LobbyStack, or while
-- its package's Stripe subscription is paying, and only while it answers by
-- its partner's lifecycle, as loadEntitlement says in packages/domain.
-- Everything else is as 0142 defined it.
CREATE OR REPLACE FUNCTION app.has_live_entitlement(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN business.partner_id IS NOT NULL THEN (account.package_id IS NULL OR account.stripe_subscription_state IN ('active', 'trialing', 'past_due')) AND app.partner_business_lifecycle_answers(business.partner_id, business.created_at)
      ELSE account.plan IN ('starter', 'pro', 'enterprise') AND account.subscription_state IN ('active', 'trialing', 'past_due')
    END
    FROM public.businesses business
    LEFT JOIN public.billing_accounts account ON account.business_id = business.id
    WHERE business.id = target_business_id
  ), false)
$$;
REVOKE ALL ON FUNCTION app.has_live_entitlement(uuid) FROM PUBLIC;
