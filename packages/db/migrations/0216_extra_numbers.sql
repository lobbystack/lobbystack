-- Extra numbers (slice 9 of docs/specs/multi-agent-build.md). Starter and Pro
-- include one number, and a business on either can buy more, each for a named
-- agent. Each costs what the carrier charges us for a number in its country,
-- from the plan catalog in packages/shared, with no markup. A plan with no
-- number limit (Enterprise, or a self-hosted server) gets them free. A
-- partner's businesses keep their tier's limits, so they get none here.
--
-- A claim with purpose 'extra' names its agent and the monthly price the
-- operator saw. When the claim is bought, a trigger moves the new number to
-- that agent and records its price in business_number_charges. The worker's
-- billing.chargeExtraNumbers job then charges each month of each number past
-- the plan's included one, oldest first, to the business's Polar customer.
--
-- The trigger, not the worker, does both, because the previous worker keeps
-- buying numbers while it drains. It inserts every number on the default agent
-- and knows nothing of prices, and the trigger fixes both after its insert.
--
-- A replacement now names the number it replaces, since a business can hold
-- several. The previous admin's six-argument function still replaces the
-- newest number, and stays until the next release. The same trigger gives the
-- new number the agent of the number it replaces.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Migration 0216 needs a role that bypasses row-level security, and % does not.', current_user;
  END IF;
END
$$;

-- Both columns are null on every existing claim and on every claim old code makes.
ALTER TABLE public.onboarding_number_claim_events
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  ADD COLUMN IF NOT EXISTS monthly_price_cents integer;

ALTER TABLE public.onboarding_number_claim_events DROP CONSTRAINT IF EXISTS onboarding_number_claim_events_monthly_price_check;
ALTER TABLE public.onboarding_number_claim_events
  ADD CONSTRAINT onboarding_number_claim_events_monthly_price_check CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0) NOT VALID;
ALTER TABLE public.onboarding_number_claim_events VALIDATE CONSTRAINT onboarding_number_claim_events_monthly_price_check;

ALTER TABLE public.onboarding_number_claim_events DROP CONSTRAINT IF EXISTS onboarding_number_claim_events_agent_fk;
ALTER TABLE public.onboarding_number_claim_events
  ADD CONSTRAINT onboarding_number_claim_events_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE public.onboarding_number_claim_events VALIDATE CONSTRAINT onboarding_number_claim_events_agent_fk;

-- What a business pays each month for a number it bought past its plan's
-- included one, and the months the worker has settled since. A month is
-- charged while the number is one of the business's numbers past the included
-- one, its oldest being the included one, and the business is on a plan that
-- sells extra numbers. Otherwise the month settles uncharged.
CREATE TABLE IF NOT EXISTS public.business_number_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  phone_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES public.onboarding_number_claim_events(id) ON DELETE SET NULL,
  country_code varchar(2) NOT NULL,
  -- US cents a month, the price the operator saw when they bought it.
  monthly_price_cents integer NOT NULL CHECK (monthly_price_cents >= 0),
  -- The number's months run from when it was bought.
  started_at timestamptz NOT NULL,
  months_settled integer NOT NULL DEFAULT 0 CHECK (months_settled >= 0),
  months_charged integer NOT NULL DEFAULT 0 CHECK (months_charged >= 0 AND months_charged <= months_settled),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS business_number_charges_phone_number_unique ON public.business_number_charges (phone_number_id);
CREATE INDEX IF NOT EXISTS business_number_charges_business_idx ON public.business_number_charges (business_id);
CREATE INDEX IF NOT EXISTS business_number_charges_claim_idx ON public.business_number_charges (claim_id);

ALTER TABLE public.business_number_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_number_charges FORCE ROW LEVEL SECURITY;

-- The business's members read their numbers' prices. The worker settles
-- months with no business in its context. Only the trigger below inserts.
DROP POLICY IF EXISTS business_number_charges_member_read ON public.business_number_charges;
CREATE POLICY business_number_charges_member_read ON public.business_number_charges FOR SELECT
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker') OR app.has_business_membership(business_id)));
DROP POLICY IF EXISTS business_number_charges_worker_read ON public.business_number_charges;
CREATE POLICY business_number_charges_worker_read ON public.business_number_charges FOR SELECT
  USING (app.current_actor_type() = 'worker');
DROP POLICY IF EXISTS business_number_charges_worker_update ON public.business_number_charges;
CREATE POLICY business_number_charges_worker_update ON public.business_number_charges FOR UPDATE
  USING (app.current_actor_type() = 'worker')
  WITH CHECK (app.current_actor_type() = 'worker');

GRANT SELECT ON public.business_number_charges TO lobbystack_app;
GRANT SELECT ON public.business_number_charges TO lobbystack_worker;
-- Settling a month moves only its counts, never the number or its price.
GRANT UPDATE (months_settled, months_charged, updated_at) ON public.business_number_charges TO lobbystack_worker;
GRANT SELECT ON public.business_number_charges TO lobbystack_readonly;

-- The numbers a direct business's plan includes before extra ones cost more,
-- or null when its plan sells none: a plan with no number limit, Free, or a
-- plan that isn't live. Matches billingPlanCatalog in packages/shared.
CREATE OR REPLACE FUNCTION app.extra_number_included(target_business_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE WHEN account.plan IN ('starter', 'pro') AND account.subscription_state IN ('active', 'trialing', 'past_due') THEN 1 END
  FROM public.businesses business
  INNER JOIN public.billing_accounts account ON account.business_id = business.id
  WHERE business.id = target_business_id AND business.partner_id IS NULL AND business.deployment_mode = 'cloud'
$$;
REVOKE ALL ON FUNCTION app.extra_number_included(uuid) FROM PUBLIC;

-- A bought claim's number goes to the claim's agent, and an extra number's
-- price starts its months. A replacement takes the agent of the number it
-- replaces, and keeps its price if it was an extra number. An agent archived
-- since the claim leaves the number where the worker put it, on the default
-- agent.
CREATE OR REPLACE FUNCTION app.settle_claimed_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_agent_id uuid;
  v_country text;
BEGIN
  IF NEW.purpose = 'extra' THEN
    v_agent_id := NEW.agent_id;
  ELSIF NEW.purpose = 'replacement' AND NEW.replacing_phone_number_id IS NOT NULL THEN
    SELECT number.agent_id INTO v_agent_id FROM public.phone_numbers number WHERE number.id = NEW.replacing_phone_number_id AND number.business_id = NEW.business_id;
  END IF;
  IF v_agent_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.agents agent WHERE agent.business_id = NEW.business_id AND agent.id = v_agent_id AND agent.archived_at IS NULL FOR SHARE) THEN
    UPDATE public.phone_numbers SET agent_id = v_agent_id, updated_at = now()
      WHERE id = NEW.phone_number_id AND business_id = NEW.business_id AND agent_id IS DISTINCT FROM v_agent_id;
  END IF;
  IF NEW.purpose = 'extra' AND NEW.monthly_price_cents IS NOT NULL THEN
    v_country := upper(COALESCE(NEW.selection_context->>'countryCode', ''));
    INSERT INTO public.business_number_charges (business_id, phone_number_id, claim_id, country_code, monthly_price_cents, started_at)
      VALUES (NEW.business_id, NEW.phone_number_id, NEW.id, CASE WHEN v_country ~ '^[A-Z]{2}$' THEN v_country ELSE 'US' END, NEW.monthly_price_cents, COALESCE(NEW.purchased_at, now()))
      ON CONFLICT (phone_number_id) DO NOTHING;
  ELSIF NEW.purpose = 'replacement' AND NEW.replacing_phone_number_id IS NOT NULL THEN
    -- A replaced extra number's price carries over, and the new number's months start now.
    INSERT INTO public.business_number_charges (business_id, phone_number_id, claim_id, country_code, monthly_price_cents, started_at)
      SELECT charge.business_id, NEW.phone_number_id, NEW.id, charge.country_code, charge.monthly_price_cents, COALESCE(NEW.purchased_at, now())
      FROM public.business_number_charges charge
      WHERE charge.phone_number_id = NEW.replacing_phone_number_id AND charge.business_id = NEW.business_id
      ON CONFLICT (phone_number_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.settle_claimed_number() FROM PUBLIC;

DROP TRIGGER IF EXISTS onboarding_number_claim_events_settle_claimed ON public.onboarding_number_claim_events;
CREATE TRIGGER onboarding_number_claim_events_settle_claimed
  AFTER UPDATE OF status ON public.onboarding_number_claim_events
  FOR EACH ROW
  WHEN (NEW.status = 'claimed' AND OLD.status IS DISTINCT FROM 'claimed' AND NEW.phone_number_id IS NOT NULL AND NEW.purpose IN ('extra', 'replacement'))
  EXECUTE FUNCTION app.settle_claimed_number();

-- Reserves an extra number for one of the business's agents. The business
-- must hold a number already, since its first comes from the plan, and the
-- price must match what its plan charges: a price on Starter or Pro, none on
-- a plan with no number limit. The claim quotas are the onboarding claim's.
CREATE OR REPLACE FUNCTION app.reserve_extra_number_claim(target_business_id uuid, target_user_id uuid, target_agent_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text, price_cents integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE claim_id uuid; business_row public.businesses%ROWTYPE; included integer; partner_member_claim boolean;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  partner_member_claim := NOT app.has_team_membership(target_business_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('phone-claim:' || target_business_id::text, 0));
  SELECT id INTO claim_id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND idempotency_key = request_key;
  IF claim_id IS NOT NULL THEN RETURN claim_id; END IF;
  UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = CASE WHEN status = 'reserved' THEN 'Number claim reservation expired.' ELSE 'Number provisioning stalled.' END, updated_at = now()
    WHERE business_id = target_business_id AND purpose = 'extra'
      AND ((status = 'reserved' AND reserved_at <= now() - interval '15 minutes') OR (status = 'provisioning' AND updated_at <= now() - interval '30 minutes'));
  IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose IN ('onboarding', 'extra') AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'number_claim_in_progress' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO business_row FROM public.businesses WHERE id = target_business_id;
  IF business_row.partner_id IS NOT NULL THEN RAISE EXCEPTION 'extra_numbers_unavailable' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE business_id = target_business_id AND id = target_agent_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'agent_not_found' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.phone_numbers WHERE business_id = target_business_id AND status IN ('active','provisioning') AND reclaim_scheduled_at IS NULL) THEN RAISE EXCEPTION 'business_number_required' USING ERRCODE = 'P0001'; END IF;
  IF business_row.deployment_mode = 'cloud' THEN
    IF NOT app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001'; END IF;
    included := app.extra_number_included(target_business_id);
    -- Enterprise has no number limit, so its numbers carry no price.
    IF (included IS NULL) <> (price_cents IS NULL) THEN RAISE EXCEPTION 'extra_number_price_changed' USING ERRCODE = 'P0001'; END IF;
  ELSIF price_cents IS NOT NULL THEN
    RAISE EXCEPTION 'extra_number_price_changed' USING ERRCODE = 'P0001';
  END IF;
  IF price_cents IS NOT NULL AND price_cents < 0 THEN RAISE EXCEPTION 'extra_number_price_changed' USING ERRCODE = 'P0001'; END IF;
  IF NOT partner_member_claim THEN
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,purpose,agent_id,monthly_price_cents,requested_e164,selection_context,claim_token_hash,idempotency_key,status,by_partner_member)
    VALUES(target_business_id,target_user_id,'extra',target_agent_id,price_cents,target_e164,selection,token_hash,request_key,'reserved',partner_member_claim)
    RETURNING id INTO claim_id;
  RETURN claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_extra_number_claim(uuid,uuid,uuid,text,jsonb,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_extra_number_claim(uuid,uuid,uuid,text,jsonb,text,text,integer) TO lobbystack_app;

-- 0159's replacement, for the number the operator picked. Everything else is as 0159 defined it.
CREATE OR REPLACE FUNCTION app.reserve_replacement_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text, target_number_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE claim_id uuid; claim_reserved_at timestamptz; old_number_id uuid; old_number_e164 text; business_row public.businesses%ROWTYPE; partner_member_claim boolean;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  partner_member_claim := NOT app.has_team_membership(target_business_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('phone-claim:' || target_business_id::text, 0));
  SELECT id INTO claim_id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND idempotency_key = request_key;
  IF claim_id IS NOT NULL THEN RETURN claim_id; END IF;
  UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = 'Number replacement reservation expired.', updated_at = now()
    WHERE business_id = target_business_id AND purpose = 'replacement' AND status = 'reserved' AND reserved_at <= now() - interval '15 minutes';
  SELECT * INTO business_row FROM public.businesses WHERE id = target_business_id;
  IF business_row.phone_number_replacement_used_at IS NOT NULL THEN RAISE EXCEPTION 'replacement_already_used' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose = 'replacement' AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'replacement_already_reserved' USING ERRCODE = 'P0001'; END IF;
  SELECT id, e164 INTO old_number_id, old_number_e164 FROM public.phone_numbers WHERE id = target_number_id AND business_id = target_business_id AND status = 'active' AND reclaim_scheduled_at IS NULL;
  IF old_number_id IS NULL THEN RAISE EXCEPTION 'active_number_required' USING ERRCODE = 'P0001'; END IF;
  IF old_number_e164 = target_e164 THEN RAISE EXCEPTION 'replacement_number_must_differ' USING ERRCODE = 'P0001'; END IF;
  IF business_row.deployment_mode = 'cloud' AND NOT app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001'; END IF;
  IF NOT partner_member_claim THEN
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,purpose,replacing_phone_number_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status,by_partner_member) VALUES(target_business_id,target_user_id,'replacement',old_number_id,target_e164,selection,token_hash,request_key,'reserved',partner_member_claim) RETURNING id, reserved_at INTO claim_id, claim_reserved_at;
  UPDATE public.businesses SET phone_number_replacement_reserved_at = claim_reserved_at, updated_at = now() WHERE id = target_business_id;
  RETURN claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_replacement_number_claim(uuid,uuid,text,jsonb,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_replacement_number_claim(uuid,uuid,text,jsonb,text,text,uuid) TO lobbystack_app;

-- The months of extra numbers that are due, oldest first, as
-- app.due_partner_number_charges lists a partner's. A month is charged while
-- the number is held past the included ones and the plan sells extra numbers,
-- and the business has a billing key for Polar. A number no longer held
-- settles no more months; one whose release is scheduled settles uncharged.
CREATE OR REPLACE FUNCTION app.due_business_number_charges(as_of timestamptz, max_rows integer, skip_charge_ids uuid[])
RETURNS TABLE (charge_id uuid, business_id uuid, billing_key text, country_code text, month integer, period_start timestamptz, amount_cents integer, charged boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  WITH held AS (
    SELECT number.id, number.business_id, row_number() OVER (PARTITION BY number.business_id ORDER BY number.created_at, number.id) AS position
    FROM public.phone_numbers number
    WHERE number.status IN ('active', 'provisioning')
      AND number.reclaim_scheduled_at IS NULL
      AND number.business_id IN (SELECT charge.business_id FROM public.business_number_charges charge)
  )
  SELECT charge.id, charge.business_id, account.billing_key, charge.country_code::text, charge.months_settled,
    charge.started_at + make_interval(months => charge.months_settled),
    charge.monthly_price_cents,
    held.id IS NOT NULL AND account.billing_key IS NOT NULL AND held.position > COALESCE(app.extra_number_included(charge.business_id), 2147483647)
  FROM public.business_number_charges charge
  INNER JOIN public.phone_numbers number ON number.id = charge.phone_number_id AND number.status IN ('active', 'provisioning')
  LEFT JOIN public.billing_accounts account ON account.business_id = charge.business_id
  LEFT JOIN held ON held.id = charge.phone_number_id
  WHERE current_setting('app.actor_type', true) = 'worker'
    AND charge.started_at + make_interval(months => charge.months_settled) <= as_of
    AND charge.id <> ALL (COALESCE(skip_charge_ids, '{}'::uuid[]))
  ORDER BY charge.started_at + make_interval(months => charge.months_settled), charge.id
  LIMIT GREATEST(max_rows, 0)
$$;
REVOKE ALL ON FUNCTION app.due_business_number_charges(timestamptz, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.due_business_number_charges(timestamptz, integer, uuid[]) TO lobbystack_worker;
