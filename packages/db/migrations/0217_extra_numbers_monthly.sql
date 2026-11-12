-- Extra numbers bill monthly, apart from the plan (slice 9 of
-- docs/specs/multi-agent-build.md). 0216 sent each month of an extra number to
-- Polar under the plan's subscription, which bills metered usage at the end of
-- its period, so an annual plan paid a year of numbers at renewal. Now a
-- business buys extra numbers through a monthly Polar subscription of their
-- own, the extra numbers add-on, which carries the only metered price for
-- billing.extra_numbers. Its webhooks set the columns below.
--
-- A business needs the add-on live before it buys an extra number, and its
-- numbers' months wait while the add-on isn't live. Enterprise now sells extra
-- numbers at the same price as Starter and Pro, with one number included.
-- Self-hosted servers keep theirs free.
--
-- The previous release knows nothing of extra numbers, so nothing it writes
-- sets these columns or reaches these functions.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Migration 0217 needs a role that bypasses row-level security, and % does not.', current_user;
  END IF;
END
$$;

ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS extra_numbers_subscription_id text,
  ADD COLUMN IF NOT EXISTS extra_numbers_subscription_state varchar(32),
  ADD COLUMN IF NOT EXISTS extra_numbers_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS extra_numbers_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_numbers_modified_at timestamptz;

-- The page Polar sends an extra numbers checkout's payer back to names the agent they were buying for.
ALTER TABLE public.billing_checkout_requests
  ADD COLUMN IF NOT EXISTS agent_id uuid;

-- A business's own operators pass the billing account's policy, so without
-- this they could mark the add-on live and buy numbers nothing bills. Only the
-- worker, which applies Polar's webhooks, and the system actor set these.
CREATE OR REPLACE FUNCTION app.keep_extra_numbers_subscription_with_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_user = 'lobbystack_app' AND app.current_actor_type() <> 'system' THEN
    RAISE EXCEPTION 'extra_numbers_subscription_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.keep_extra_numbers_subscription_with_worker() FROM PUBLIC;

DROP TRIGGER IF EXISTS billing_accounts_keep_extra_numbers_before_insert ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_extra_numbers_before_insert
BEFORE INSERT ON public.billing_accounts
FOR EACH ROW
WHEN (NEW.extra_numbers_subscription_id IS NOT NULL OR NEW.extra_numbers_subscription_state IS NOT NULL OR NEW.extra_numbers_current_period_end IS NOT NULL OR NEW.extra_numbers_cancel_at_period_end OR NEW.extra_numbers_modified_at IS NOT NULL)
EXECUTE FUNCTION app.keep_extra_numbers_subscription_with_worker();

DROP TRIGGER IF EXISTS billing_accounts_keep_extra_numbers_before_update ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_extra_numbers_before_update
BEFORE UPDATE ON public.billing_accounts
FOR EACH ROW
WHEN (OLD.extra_numbers_subscription_id IS DISTINCT FROM NEW.extra_numbers_subscription_id OR OLD.extra_numbers_subscription_state IS DISTINCT FROM NEW.extra_numbers_subscription_state
  OR OLD.extra_numbers_current_period_end IS DISTINCT FROM NEW.extra_numbers_current_period_end OR OLD.extra_numbers_cancel_at_period_end IS DISTINCT FROM NEW.extra_numbers_cancel_at_period_end
  OR OLD.extra_numbers_modified_at IS DISTINCT FROM NEW.extra_numbers_modified_at)
EXECUTE FUNCTION app.keep_extra_numbers_subscription_with_worker();

-- 0216's, with Enterprise: Starter, Pro and Enterprise include one number.
CREATE OR REPLACE FUNCTION app.extra_number_included(target_business_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE WHEN account.plan IN ('starter', 'pro', 'enterprise') AND account.subscription_state IN ('active', 'trialing', 'past_due') THEN 1 END
  FROM public.businesses business
  INNER JOIN public.billing_accounts account ON account.business_id = business.id
  WHERE business.id = target_business_id AND business.partner_id IS NULL AND business.deployment_mode = 'cloud'
$$;
REVOKE ALL ON FUNCTION app.extra_number_included(uuid) FROM PUBLIC;

-- Whether the business's extra numbers add-on bills now. past_due still
-- bills, as a plan's does, while Polar retries the card.
CREATE OR REPLACE FUNCTION app.extra_numbers_subscription_live(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT account.extra_numbers_subscription_id IS NOT NULL AND account.extra_numbers_subscription_state IN ('active', 'trialing', 'past_due')
    FROM public.billing_accounts account
    WHERE account.business_id = target_business_id
  ), false)
$$;
REVOKE ALL ON FUNCTION app.extra_numbers_subscription_live(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.extra_numbers_subscription_live(uuid) TO lobbystack_app, lobbystack_worker, lobbystack_readonly;

-- 0216's, which now also needs the add-on live before it sells a priced number.
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
    IF (included IS NULL) <> (price_cents IS NULL) THEN RAISE EXCEPTION 'extra_number_price_changed' USING ERRCODE = 'P0001'; END IF;
    -- The add-on bills the number's months, so it has to be live first.
    IF price_cents IS NOT NULL AND NOT app.extra_numbers_subscription_live(target_business_id) THEN RAISE EXCEPTION 'extra_numbers_subscription_required' USING ERRCODE = 'P0001'; END IF;
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

-- 0216's, except that a month the add-on would charge waits while the add-on
-- isn't live, instead of settling, so it's charged once the add-on bills
-- again. A month nothing charges, because the plan ended, the number is the
-- included one or its release is scheduled, still settles uncharged.
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
  ), due AS (
    SELECT charge.id, charge.business_id, account.billing_key, charge.country_code::text AS country_code, charge.months_settled,
      charge.started_at + make_interval(months => charge.months_settled) AS period_start,
      charge.monthly_price_cents,
      held.id IS NOT NULL AND account.billing_key IS NOT NULL AND held.position > COALESCE(app.extra_number_included(charge.business_id), 2147483647) AS chargeable
    FROM public.business_number_charges charge
    INNER JOIN public.phone_numbers number ON number.id = charge.phone_number_id AND number.status IN ('active', 'provisioning')
    LEFT JOIN public.billing_accounts account ON account.business_id = charge.business_id
    LEFT JOIN held ON held.id = charge.phone_number_id
    WHERE current_setting('app.actor_type', true) = 'worker'
      AND charge.started_at + make_interval(months => charge.months_settled) <= as_of
      AND charge.id <> ALL (COALESCE(skip_charge_ids, '{}'::uuid[]))
  )
  SELECT due.id, due.business_id, due.billing_key, due.country_code, due.months_settled, due.period_start, due.monthly_price_cents, due.chargeable
  FROM due
  WHERE NOT due.chargeable OR app.extra_numbers_subscription_live(due.business_id)
  ORDER BY due.period_start, due.id
  LIMIT GREATEST(max_rows, 0)
$$;
REVOKE ALL ON FUNCTION app.due_business_number_charges(timestamptz, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.due_business_number_charges(timestamptz, integer, uuid[]) TO lobbystack_worker;
