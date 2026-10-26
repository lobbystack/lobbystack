-- A business's overage on its package reaches its partner's Stripe as meter
-- events on the partner's connected account (ADR 0009). Each event's report
-- has its own status beside sync_status, which keeps following the pool's
-- overage to Polar: one usage event can owe both. stripe_sync_status is null
-- while there's nothing to send, pending until the partner's Stripe has what
-- the event put past the business's allowance, synced once it has, and
-- skipped when no subscription of the business can bill it.
--
-- The worker sends only what the event's overage moved since its last
-- report. It writes the amount it's about to send in
-- stripe_overage_sending_minor and counts the report in
-- stripe_overage_reports before it asks Stripe, so a retry sends the same
-- amount under the same identifier, which Stripe charges once. Stripe's
-- answer then moves the amount to stripe_overage_reported_minor. Amounts are
-- in the minor unit of the package's currency, as business_overage_minor is.
ALTER TABLE public.billing_usage_events
  ADD COLUMN IF NOT EXISTS stripe_sync_status varchar(32),
  ADD COLUMN IF NOT EXISTS stripe_overage_reported_minor double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_overage_sending_minor double precision,
  ADD COLUMN IF NOT EXISTS stripe_overage_reports integer NOT NULL DEFAULT 0;

-- NOT VALID, so this file doesn't read every usage event while it holds the
-- lock that blocks every call, chat and text from reserving usage; 0157
-- validates it under a lighter lock.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.billing_usage_events'::regclass AND conname = 'billing_usage_events_stripe_overage_reports_check') THEN
    ALTER TABLE public.billing_usage_events ADD CONSTRAINT billing_usage_events_stripe_overage_reports_check CHECK (stripe_overage_reports >= 0) NOT VALID;
  END IF;
END
$$;

-- The items of the business's subscription that bill its overage, one per
-- meter, as {"subscriptionId": ..., "voice": ..., "chat": ...}. The worker
-- adds each to the subscription the first time it reports that kind of
-- overage, and keeps it here so later reports send only the meter event. A
-- new subscription starts over, since the items name the old one.
ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS stripe_overage_items jsonb;

-- Only the worker, which adds the items, and the system actor, which forgets
-- them when the business leaves its partner, write them, as 0142 and 0155
-- keep the package and its overage: a business's own operators who named an
-- item the subscription doesn't have would never pay their overage.
CREATE OR REPLACE FUNCTION app.keep_overage_items_with_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_user IN ('lobbystack_app', 'lobbystack_worker') AND app.current_actor_type() NOT IN ('system', 'worker') THEN
    RAISE EXCEPTION 'package_billing_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.keep_overage_items_with_worker() FROM PUBLIC;

DROP TRIGGER IF EXISTS billing_accounts_keep_overage_items_before_insert ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_overage_items_before_insert
BEFORE INSERT ON public.billing_accounts
FOR EACH ROW
WHEN (NEW.stripe_overage_items IS NOT NULL)
EXECUTE FUNCTION app.keep_overage_items_with_worker();

DROP TRIGGER IF EXISTS billing_accounts_keep_overage_items_before_update ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_overage_items_before_update
BEFORE UPDATE ON public.billing_accounts
FOR EACH ROW
WHEN (OLD.stripe_overage_items IS DISTINCT FROM NEW.stripe_overage_items)
EXECUTE FUNCTION app.keep_overage_items_with_worker();

-- A business on a package gets an email at 80% and at 100% of its minutes
-- and its chats each month. The month records each alert it sent, keyed by
-- the kind, the share and the allowance it measured, so each goes out once,
-- and again only when the business moves to a package of another size.
ALTER TABLE public.billing_usage_months
  ADD COLUMN IF NOT EXISTS alerts_sent jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Who on the business's own team gets its allowance alerts: the active
-- owners and admins, with the address, name and language each email goes
-- out in, and the business's name. The partner's owners and admins get their
-- own copy, read through app.partner_pool_alert_recipients. RLS hides users
-- from the worker, so this reads as its owner, and answers only the worker
-- inside that business.
CREATE OR REPLACE FUNCTION app.business_allowance_alert_recipients(target_business_id uuid)
RETURNS TABLE (user_id uuid, email text, name text, preferred_locale text, business_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT person.id, person.email, person.name, person.preferred_locale::text, business.name
  FROM public.businesses business
  INNER JOIN public.business_memberships membership ON membership.business_id = business.id AND membership.status = 'active' AND membership.role IN ('business_owner', 'business_admin')
  INNER JOIN public.users person ON person.id = membership.user_id
  WHERE session_user = 'lobbystack_worker'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'worker'
    AND target_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
    AND business.id = target_business_id
  ORDER BY membership.created_at, person.id
$$;
REVOKE ALL ON FUNCTION app.business_allowance_alert_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.business_allowance_alert_recipients(uuid) TO lobbystack_worker;
