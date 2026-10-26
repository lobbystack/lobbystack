-- A partner's tier sets how many phone numbers its businesses hold between
-- them, while the deployment bills tiers, on the cloud or self-hosted. A claim
-- for a new number then counts the numbers every one of the partner's
-- businesses holds against the tier's included numbers. A paid tier can go
-- past them, and each number past them costs the partner what the host pays
-- its carrier for it each month. A tier that isn't paid, Free included, gets
-- no number past them. Without tier billing, nobody would pay for a partner's
-- numbers on the cloud, so the cloud buys its businesses no new number. A
-- self-hosted server without tier billing puts no tier limit on them and
-- charges for none, as it puts none on the pool. The daily and 30-day claim
-- quotas count the claims of all the partner's businesses, sized from its
-- tier, so creating businesses can't get around them.

-- Whether this deployment bills partners for tiers: every
-- POLAR_PARTNER_<TIER>_<INTERVAL>_PRODUCT_ID set, each to its own product, as
-- partnerFeatures in packages/shared decides. Only the environment knows, so
-- the worker records it here when it starts and each time it settles numbers'
-- months, and the number claims and the monthly charges read it. The table
-- holds at most one row. Until the worker first records it after this
-- migration, the deployment bills no tiers: the cloud buys partners' businesses
-- no new number, and no month is charged.
CREATE TABLE IF NOT EXISTS public.partner_tier_billing (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_tier_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_tier_billing FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_tier_billing_worker ON public.partner_tier_billing;
CREATE POLICY partner_tier_billing_worker ON public.partner_tier_billing
  USING (app.current_actor_type() = 'worker')
  WITH CHECK (app.current_actor_type() = 'worker');

GRANT SELECT, INSERT, UPDATE ON public.partner_tier_billing TO lobbystack_worker;
GRANT SELECT ON public.partner_tier_billing TO lobbystack_readonly;

-- Whether this deployment bills tiers, as the worker last recorded it. Only
-- the functions below call this, as their owner.
CREATE OR REPLACE FUNCTION app.partner_tier_billing()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((SELECT billing.enabled FROM public.partner_tier_billing billing WHERE billing.id = 1), false)
$$;
REVOKE ALL ON FUNCTION app.partner_tier_billing() FROM PUBLIC;

-- What the host pays for each number a partner's business holds on a
-- deployment that bills tiers, read from the carrier when the worker bought
-- it, and the months the worker has settled since. Each month the number is
-- held, it's charged to the partner when it's one of the partner's numbers
-- past its tier's included ones: the partner's oldest numbers are the
-- included ones.
CREATE TABLE IF NOT EXISTS public.partner_number_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  phone_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  -- US cents a month.
  monthly_cost_cents integer NOT NULL CHECK (monthly_cost_cents >= 0),
  -- The number's months run from when it was bought.
  started_at timestamptz NOT NULL,
  -- Months the worker settled, charged or covered by the tier, and how many of them it charged.
  months_settled integer NOT NULL DEFAULT 0 CHECK (months_settled >= 0),
  months_charged integer NOT NULL DEFAULT 0 CHECK (months_charged >= 0 AND months_charged <= months_settled),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_number_charges_phone_number_unique ON public.partner_number_charges (phone_number_id);
CREATE INDEX IF NOT EXISTS partner_number_charges_partner_idx ON public.partner_number_charges (partner_id);
-- Deleting a business deletes the rows that name it.
CREATE INDEX IF NOT EXISTS partner_number_charges_business_idx ON public.partner_number_charges (business_id);

ALTER TABLE public.partner_number_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_number_charges FORCE ROW LEVEL SECURITY;

-- Only the worker reads and writes the costs. It records one when it buys a
-- number, in the business's transaction, for that business's own number and
-- partner, and settles months with no business in its context.
DROP POLICY IF EXISTS partner_number_charges_worker_read ON public.partner_number_charges;
CREATE POLICY partner_number_charges_worker_read ON public.partner_number_charges FOR SELECT
  USING (app.current_actor_type() = 'worker');
DROP POLICY IF EXISTS partner_number_charges_worker_insert ON public.partner_number_charges;
CREATE POLICY partner_number_charges_worker_insert ON public.partner_number_charges FOR INSERT
  WITH CHECK (
    app.current_actor_type() = 'worker'
    AND business_id = app.current_business_id()
    AND partner_id = app.business_partner(business_id)
    AND EXISTS (SELECT 1 FROM public.phone_numbers number WHERE number.id = phone_number_id AND number.business_id = partner_number_charges.business_id)
  );
DROP POLICY IF EXISTS partner_number_charges_worker_update ON public.partner_number_charges;
CREATE POLICY partner_number_charges_worker_update ON public.partner_number_charges FOR UPDATE
  USING (app.current_actor_type() = 'worker')
  WITH CHECK (app.current_actor_type() = 'worker');

GRANT SELECT, INSERT ON public.partner_number_charges TO lobbystack_worker;
-- Settling a month moves only its counts, never the number, its partner or what it costs.
GRANT UPDATE (months_settled, months_charged, updated_at) ON public.partner_number_charges TO lobbystack_worker;
GRANT SELECT ON public.partner_number_charges TO lobbystack_readonly;

-- Whether the partner holds a paid tier now: the tier Polar sold it, on a live
-- subscription, past_due included, as partnerTierInForce in packages/shared
-- decides. A partner Polar never billed is on Free. Only the functions below
-- call this, as their owner.
CREATE OR REPLACE FUNCTION app.partner_paid_tier(target_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT account.tier IN ('starter', 'growth', 'scale') AND account.subscription_state IN ('active', 'trialing', 'past_due')
    FROM public.partner_billing_accounts account
    WHERE account.partner_id = target_partner_id
  ), false)
$$;
REVOKE ALL ON FUNCTION app.partner_paid_tier(uuid) FROM PUBLIC;

-- The phone numbers the partner's tier includes. The worker records the
-- included numbers of the tier in force each time it reconciles the tier; a
-- partner Polar never billed is on Free, which includes none.
CREATE OR REPLACE FUNCTION app.partner_included_numbers(target_partner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((SELECT account.included_numbers FROM public.partner_billing_accounts account WHERE account.partner_id = target_partner_id), 0)
$$;
REVOKE ALL ON FUNCTION app.partner_included_numbers(uuid) FROM PUBLIC;

-- The numbers the partner's businesses hold between them: each active number
-- not on its way out, plus each new number a claim is buying now. A number
-- scheduled for release, such as a replaced number or a trial number, isn't
-- held. A claim counts while the claim functions would still take it up: 15
-- minutes reserved, or 30 minutes provisioning with no progress. A partner's
-- business never claims a trial number, as the check below says.
CREATE OR REPLACE FUNCTION app.count_partner_numbers(target_partner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT ((
    SELECT count(*)
    FROM public.phone_numbers number
    INNER JOIN public.businesses business ON business.id = number.business_id
    WHERE business.partner_id = target_partner_id
      AND number.status IN ('active', 'provisioning')
      AND number.reclaim_scheduled_at IS NULL
  ) + (
    SELECT count(*)
    FROM public.onboarding_number_claim_events claim
    INNER JOIN public.businesses business ON business.id = claim.business_id
    WHERE business.partner_id = target_partner_id
      AND claim.purpose = 'onboarding'
      AND ((claim.status = 'reserved' AND claim.reserved_at > now() - interval '15 minutes') OR (claim.status = 'provisioning' AND claim.updated_at > now() - interval '30 minutes'))
  ))::integer
$$;
REVOKE ALL ON FUNCTION app.count_partner_numbers(uuid) FROM PUBLIC;

-- Where the partner stands on numbers, for the number search, the worker
-- and the console's Billing page: the numbers held, the numbers its tier
-- includes, whether its tier is paid, which lets it hold more, and whether
-- this deployment counts them at all, which it does only while it bills
-- tiers. RLS hides the partner's other businesses from every caller, so this
-- reads as its owner. It answers inside one of the partner's businesses, or
-- for an operator on the partner's team.
CREATE OR REPLACE FUNCTION app.partner_number_standing(target_partner_id uuid)
RETURNS TABLE (held integer, included integer, paid_tier boolean, counted boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  SELECT app.count_partner_numbers(target_partner_id), app.partner_included_numbers(target_partner_id), app.partner_paid_tier(target_partner_id), app.partner_tier_billing()
  WHERE app.business_partner(NULLIF(current_setting('app.business_id', true), '')::uuid) = target_partner_id
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; read the setting.
    OR (current_setting('app.actor_type', true) = 'operator' AND app.partner_role(target_partner_id) IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION app.partner_number_standing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_number_standing(uuid) TO lobbystack_app, lobbystack_worker;

-- The claims a partner's businesses made that bought a number since
-- `window_start`, plus the ones buying one now, so a burst of claims from many
-- businesses can't get past the quotas before any of them is bought. A claim
-- buys one now while the claim functions would still take it up: 15 minutes
-- reserved, or 30 minutes provisioning with no progress. Only the check below
-- calls this, as its owner.
CREATE OR REPLACE FUNCTION app.count_partner_bought_claims(target_partner_id uuid, window_start timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT count(*)::integer
  FROM public.onboarding_number_claim_events claim
  INNER JOIN public.businesses business ON business.id = claim.business_id
  WHERE business.partner_id = target_partner_id
    AND ((claim.status = 'claimed' AND claim.purchased_at >= window_start)
      OR (claim.status = 'reserved' AND claim.reserved_at > now() - interval '15 minutes')
      OR (claim.status = 'provisioning' AND claim.updated_at > now() - interval '30 minutes'))
$$;
REVOKE ALL ON FUNCTION app.count_partner_bought_claims(uuid, timestamptz) FROM PUBLIC;

-- 0135 refused every number for a partner's business on the cloud until
-- tiers counted them; this check replaces it. Every claim, from onboarding, a
-- replacement, a trial or the API, reserves itself with a row in
-- onboarding_number_claim_events, so this one check covers them all. The
-- claim functions already hold the business's lock; this takes the partner's
-- next, so two of its businesses claim in turn: both can't take its last
-- included number, and the quotas below stay exact. It reads the partner's
-- businesses as the table's owner, whatever role inserts the row.
--
-- Tier billing decides who counts a claim for a new number. A replacement
-- swaps a number the business already holds, so only the quotas apply to it.
-- - While the deployment bills tiers, on the cloud or self-hosted, a claim
--   past the tier's included numbers needs a paid tier.
-- - On the cloud without tier billing, the host would pay for numbers nobody
--   bills, so every claim for a new number is refused. That covers the time
--   before the worker first records tier billing.
-- - A self-hosted server without tier billing puts no tier limit on them.
-- - A partner's business pays its partner, so it never gets the host's free
--   trial number. One that isn't live, such as a business whose package
--   isn't paid (0142), would otherwise reach the trial claims.
--
-- The quotas apply on every deployment. Each business makes at most three
-- claims an hour. Between them, the partner's businesses buy at most the
-- larger of 2 and the included numbers of the tier in force a day, and the
-- larger of 5 and twice those in 30 days. Without tier billing, they buy at
-- most 2 a day and 5 in 30 days.
CREATE OR REPLACE FUNCTION app.check_partner_number_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
DECLARE
  claim_partner_id uuid;
  claim_deployment_mode text;
  tier_billing boolean;
  included integer;
  daily_quota integer;
  monthly_quota integer;
BEGIN
  SELECT business.partner_id, business.deployment_mode INTO claim_partner_id, claim_deployment_mode FROM public.businesses business WHERE business.id = NEW.business_id;
  IF claim_partner_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('partner-numbers:' || claim_partner_id::text, 0));
  tier_billing := app.partner_tier_billing();
  included := app.partner_included_numbers(claim_partner_id);
  daily_quota := CASE WHEN tier_billing THEN GREATEST(2, included) ELSE 2 END;
  monthly_quota := CASE WHEN tier_billing THEN GREATEST(5, 2 * included) ELSE 5 END;

  IF NEW.purpose = 'onboarding' THEN
    IF COALESCE(NEW.selection_context->>'trial', '') = 'true' OR (NOT tier_billing AND claim_deployment_mode = 'cloud') THEN
      RAISE EXCEPTION 'partner_numbers_unavailable' USING ERRCODE = 'P0001';
    END IF;
    IF tier_billing
      AND app.count_partner_numbers(claim_partner_id) >= included
      AND NOT app.partner_paid_tier(claim_partner_id) THEN
      RAISE EXCEPTION 'partner_number_limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF (SELECT count(*) FROM public.onboarding_number_claim_events claim WHERE claim.business_id = NEW.business_id AND claim.reserved_at >= now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  IF app.count_partner_bought_claims(claim_partner_id, now() - interval '1 day') >= daily_quota THEN
    RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001';
  END IF;
  IF app.count_partner_bought_claims(claim_partner_id, now() - interval '30 days') >= monthly_quota THEN
    RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.check_partner_number_claim() FROM PUBLIC;

DROP TRIGGER IF EXISTS onboarding_number_claim_events_refuse_partner_before_insert ON public.onboarding_number_claim_events;
DROP FUNCTION IF EXISTS app.refuse_partner_number_claim();
DROP TRIGGER IF EXISTS onboarding_number_claim_events_partner_before_insert ON public.onboarding_number_claim_events;
CREATE TRIGGER onboarding_number_claim_events_partner_before_insert
BEFORE INSERT ON public.onboarding_number_claim_events
FOR EACH ROW
EXECUTE FUNCTION app.check_partner_number_claim();

-- The worker's monthly sweep: the next month due of each number a partner's
-- business holds, oldest first, with what it costs and whether the partner
-- pays for it. It does while the deployment bills tiers, when the number is
-- held and past the included ones of a paid tier, counting the partner's held
-- numbers from the oldest. A number on its way out, whose release is
-- scheduled, still settles its months, uncharged, so a release cancelled
-- later charges no month twice and none it skipped. A number released, or
-- whose business left the partner, settles no more months. The worker skips
-- the charges in skip_charge_ids, whose report failed earlier in the same
-- run. RLS hides other businesses' numbers from the worker, so this reads as
-- its owner, for the worker only.
CREATE OR REPLACE FUNCTION app.due_partner_number_charges(as_of timestamptz, max_rows integer, skip_charge_ids uuid[])
RETURNS TABLE (charge_id uuid, partner_id uuid, business_id uuid, month integer, period_start timestamptz, amount_cents integer, charged boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  WITH held AS (
    SELECT number.id, row_number() OVER (PARTITION BY business.partner_id ORDER BY number.created_at, number.id) AS position
    FROM public.phone_numbers number
    INNER JOIN public.businesses business ON business.id = number.business_id
    WHERE business.partner_id IS NOT NULL
      AND number.status IN ('active', 'provisioning')
      AND number.reclaim_scheduled_at IS NULL
  )
  SELECT charge.id, charge.partner_id, charge.business_id, charge.months_settled,
    charge.started_at + make_interval(months => charge.months_settled),
    charge.monthly_cost_cents,
    held.id IS NOT NULL AND app.partner_tier_billing() AND app.partner_paid_tier(charge.partner_id) AND held.position > app.partner_included_numbers(charge.partner_id)
  FROM public.partner_number_charges charge
  INNER JOIN public.phone_numbers number ON number.id = charge.phone_number_id AND number.status IN ('active', 'provisioning')
  INNER JOIN public.businesses business ON business.id = number.business_id AND business.partner_id = charge.partner_id
  LEFT JOIN held ON held.id = charge.phone_number_id
  WHERE current_setting('app.actor_type', true) = 'worker'
    AND charge.started_at + make_interval(months => charge.months_settled) <= as_of
    AND charge.id <> ALL (COALESCE(skip_charge_ids, '{}'::uuid[]))
  ORDER BY charge.started_at + make_interval(months => charge.months_settled), charge.id
  LIMIT GREATEST(max_rows, 0)
$$;
REVOKE ALL ON FUNCTION app.due_partner_number_charges(timestamptz, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.due_partner_number_charges(timestamptz, integer, uuid[]) TO lobbystack_worker;
