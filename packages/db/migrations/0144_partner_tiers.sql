-- A partner pays the host for a tier through Polar, the way a direct business
-- pays for a plan. Its Polar customer's external id is partner:<partner id>,
-- so Polar's webhooks name the partner instead of a business. Only a
-- partner's owners start a checkout. The worker creates it with Polar and
-- reconciles Polar's events into the partner's billing account, with no
-- business in its context.

-- The tier Polar last sold the partner, its subscription, and the terms of the
-- tier in force when the worker last reconciled it: Free's, unless a paid tier
-- is live. Usage metering and number claims read the pool and the included
-- numbers from here. A partner Polar never billed has no row and is on Free.
CREATE TABLE IF NOT EXISTS public.partner_billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  billing_key text NOT NULL,
  -- Polar's own customer and subscription ids.
  customer_id text,
  subscription_id text,
  -- A tier that ended keeps its name, and its subscription state says it ended.
  tier varchar(16) NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'growth', 'scale')),
  billing_interval varchar(16) CHECK (billing_interval IN ('monthly', 'annual')),
  subscription_state varchar(32),
  current_period_start timestamptz,
  current_period_end timestamptz,
  -- When a tier the partner canceled ends, while it runs to the end of its period. Null while it renews.
  ends_at timestamptz,
  -- Voice seconds and website chats each month, shared by all the partner's businesses.
  pool_voice_seconds integer NOT NULL CHECK (pool_voice_seconds >= 0),
  pool_chats integer NOT NULL CHECK (pool_chats >= 0),
  -- Phone numbers the partner's businesses hold between them before extra numbers cost more.
  included_numbers integer NOT NULL CHECK (included_numbers >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_billing_accounts_billing_key_check CHECK (billing_key = 'partner:' || partner_id::text)
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_billing_accounts_partner_unique ON public.partner_billing_accounts (partner_id);
CREATE UNIQUE INDEX IF NOT EXISTS partner_billing_accounts_billing_key_unique ON public.partner_billing_accounts (billing_key);

-- An owner's request for a Polar checkout, which the worker turns into a
-- checkout page. The owner is sent back to the console's origin they started
-- from: the host's domain or the partner's own.
CREATE TABLE IF NOT EXISTS public.partner_checkout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tier varchar(16) NOT NULL CHECK (tier IN ('starter', 'growth', 'scale')),
  billing_interval varchar(16) NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error', 'superseded')),
  return_origin text NOT NULL CHECK (return_origin ~ '^https?://[^/?#]+$'),
  checkout_id text,
  checkout_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_checkout_requests_partner_status_idx ON public.partner_checkout_requests (partner_id, status, created_at);

ALTER TABLE public.partner_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_billing_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_checkout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_checkout_requests FORCE ROW LEVEL SECURITY;

-- The partner's team reads its tier. Only the worker writes it, from Polar's events.
DROP POLICY IF EXISTS partner_billing_accounts_read ON public.partner_billing_accounts;
CREATE POLICY partner_billing_accounts_read ON public.partner_billing_accounts FOR SELECT
  USING (app.current_actor_type() IN ('system', 'worker') OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IS NOT NULL));
DROP POLICY IF EXISTS partner_billing_accounts_worker_insert ON public.partner_billing_accounts;
CREATE POLICY partner_billing_accounts_worker_insert ON public.partner_billing_accounts FOR INSERT
  WITH CHECK (app.current_actor_type() = 'worker');
DROP POLICY IF EXISTS partner_billing_accounts_worker_update ON public.partner_billing_accounts;
CREATE POLICY partner_billing_accounts_worker_update ON public.partner_billing_accounts FOR UPDATE
  USING (app.current_actor_type() = 'worker')
  WITH CHECK (app.current_actor_type() = 'worker');

-- Owners read their partner's checkouts. The domain queues one as the system
-- actor, since its job belongs to no business, after checking the person is
-- an owner; the worker fills it in.
DROP POLICY IF EXISTS partner_checkout_requests_read ON public.partner_checkout_requests;
CREATE POLICY partner_checkout_requests_read ON public.partner_checkout_requests FOR SELECT
  USING (app.current_actor_type() IN ('system', 'worker') OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) = 'owner'));
DROP POLICY IF EXISTS partner_checkout_requests_system_insert ON public.partner_checkout_requests;
CREATE POLICY partner_checkout_requests_system_insert ON public.partner_checkout_requests FOR INSERT
  WITH CHECK (app.current_actor_type() = 'system');
DROP POLICY IF EXISTS partner_checkout_requests_update ON public.partner_checkout_requests;
CREATE POLICY partner_checkout_requests_update ON public.partner_checkout_requests FOR UPDATE
  USING (app.current_actor_type() IN ('system', 'worker'))
  WITH CHECK (app.current_actor_type() IN ('system', 'worker'));

GRANT SELECT ON public.partner_billing_accounts TO lobbystack_app, lobbystack_readonly;
GRANT SELECT, INSERT, UPDATE ON public.partner_billing_accounts TO lobbystack_worker;
GRANT SELECT, INSERT ON public.partner_checkout_requests TO lobbystack_app;
GRANT SELECT ON public.partner_checkout_requests TO lobbystack_worker, lobbystack_readonly;
-- The app only supersedes a checkout; the worker claims it, fills in Polar's page and records failures.
GRANT UPDATE (status, updated_at) ON public.partner_checkout_requests TO lobbystack_app;
GRANT UPDATE (status, checkout_id, checkout_url, error, updated_at) ON public.partner_checkout_requests TO lobbystack_worker;

-- Polar's events that belong to a partner, not a business. The webhook route
-- stores them as the system actor; the worker reconciles them with no
-- business in its context, so it reaches every partner's events, and only
-- those. An event belongs to a business or a partner, never both. The key and
-- the check start NOT VALID, so this file doesn't read every event while it
-- holds the table's lock; 0146 validates them, after 0145 indexes the column.
ALTER TABLE public.provider_events ADD COLUMN IF NOT EXISTS partner_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.provider_events'::regclass AND conname = 'provider_events_partner_id_fkey') THEN
    ALTER TABLE public.provider_events ADD CONSTRAINT provider_events_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.provider_events'::regclass AND conname = 'provider_events_one_owner') THEN
    ALTER TABLE public.provider_events ADD CONSTRAINT provider_events_one_owner CHECK (business_id IS NULL OR partner_id IS NULL) NOT VALID;
  END IF;
END
$$;

DROP POLICY IF EXISTS provider_events_partner_worker ON public.provider_events;
CREATE POLICY provider_events_partner_worker ON public.provider_events
  TO lobbystack_worker
  USING (app.current_actor_type() = 'worker' AND business_id IS NULL AND partner_id IS NOT NULL)
  WITH CHECK (app.current_actor_type() = 'worker' AND business_id IS NULL AND partner_id IS NOT NULL);
