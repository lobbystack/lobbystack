-- A partner bills its businesses through its own Stripe account, connected
-- with Stripe Connect (ADR 0009). The console's Stripe page connects it, and
-- the Connect webhook keeps what this file's first table knows of it
-- current. Packages are what the partner sells its businesses: a monthly
-- price, an optional setup fee and an allowance, in the connected account's
-- currency, with the product and prices created on that account. Owners and
-- admins see both; only owners connect Stripe, which the domain checks.

CREATE TABLE IF NOT EXISTS public.partner_stripe_accounts (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  stripe_account_id varchar(255) NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  country varchar(2) CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  -- The account's default currency, which its packages are priced in.
  currency varchar(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  details_submitted boolean NOT NULL DEFAULT false,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  disabled_reason varchar(120),
  -- When the partner disconnected the account from this deployment in Stripe.
  -- The deployment can't reach it after that, so connecting again makes a new one.
  disconnected_at timestamptz,
  -- When Stripe last described the account, by the event's creation or a read,
  -- so news that arrives late never overwrites newer news.
  synced_at timestamptz,
  connected_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A connected account belongs to one partner, and the webhook finds it by its id.
CREATE UNIQUE INDEX IF NOT EXISTS partner_stripe_accounts_account_unique ON public.partner_stripe_accounts (stripe_account_id);

CREATE TABLE IF NOT EXISTS public.partner_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  -- Amounts in the currency's smallest unit, as ISO 4217 counts it. Stripe takes at most 8 digits.
  monthly_price_minor integer NOT NULL CHECK (monthly_price_minor BETWEEN 1 AND 99999999),
  setup_fee_minor integer CHECK (setup_fee_minor IS NULL OR setup_fee_minor BETWEEN 1 AND 99999999),
  -- The monthly allowance a business on the package gets.
  voice_minutes integer NOT NULL CHECK (voice_minutes BETWEEN 0 AND 1000000),
  chats integer NOT NULL CHECK (chats BETWEEN 0 AND 1000000),
  -- The connected account the product and prices live on. A package stays on
  -- it, so one made before the partner reconnected never sells on another.
  stripe_account_id varchar(255) NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  stripe_product_id varchar(255) NOT NULL,
  stripe_price_id varchar(255) NOT NULL,
  stripe_setup_price_id varchar(255),
  -- When the partner stopped selling it. Businesses already on it keep it.
  archived_at timestamptz,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_packages_setup_price CHECK ((setup_fee_minor IS NULL) = (stripe_setup_price_id IS NULL))
);
CREATE INDEX IF NOT EXISTS partner_packages_partner_idx ON public.partner_packages (partner_id, created_at);

-- A package's prices must live on its partner's own connected account, in
-- that account's currency, so a business on it always pays the partner. Both
-- runtime roles reach this table only through the policies below, and this
-- holds for the system actor too. It reads the account as the table's owner.
CREATE OR REPLACE FUNCTION app.check_partner_package_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_stripe_accounts account
    WHERE account.partner_id = NEW.partner_id
      AND account.stripe_account_id = NEW.stripe_account_id
      AND account.currency = NEW.currency
      AND account.disconnected_at IS NULL
  ) THEN
    RAISE EXCEPTION 'package_account_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.check_partner_package_account() FROM PUBLIC;

DROP TRIGGER IF EXISTS partner_packages_check_account_before_insert ON public.partner_packages;
CREATE TRIGGER partner_packages_check_account_before_insert
BEFORE INSERT ON public.partner_packages
FOR EACH ROW
EXECUTE FUNCTION app.check_partner_package_account();

ALTER TABLE public.partner_stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_stripe_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_packages FORCE ROW LEVEL SECURITY;

-- Owners and admins read the connection: admins price packages in its
-- currency. Members never see it. Only the system actor, which onboarding and
-- the Connect webhook run as, writes it.
DROP POLICY IF EXISTS partner_stripe_accounts_manager_read ON public.partner_stripe_accounts;
CREATE POLICY partner_stripe_accounts_manager_read ON public.partner_stripe_accounts FOR SELECT
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')));
DROP POLICY IF EXISTS partner_stripe_accounts_system_insert ON public.partner_stripe_accounts;
CREATE POLICY partner_stripe_accounts_system_insert ON public.partner_stripe_accounts FOR INSERT
  WITH CHECK (app.current_actor_type() = 'system');
DROP POLICY IF EXISTS partner_stripe_accounts_system_update ON public.partner_stripe_accounts;
CREATE POLICY partner_stripe_accounts_system_update ON public.partner_stripe_accounts FOR UPDATE
  USING (app.current_actor_type() = 'system')
  WITH CHECK (app.current_actor_type() = 'system');

-- Owners and admins see and manage the partner's packages. Members never see
-- them, since they carry prices.
DROP POLICY IF EXISTS partner_packages_manager_read ON public.partner_packages;
CREATE POLICY partner_packages_manager_read ON public.partner_packages FOR SELECT
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')));
DROP POLICY IF EXISTS partner_packages_manager_insert ON public.partner_packages;
CREATE POLICY partner_packages_manager_insert ON public.partner_packages FOR INSERT
  WITH CHECK (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')));
DROP POLICY IF EXISTS partner_packages_manager_update ON public.partner_packages;
CREATE POLICY partner_packages_manager_update ON public.partner_packages FOR UPDATE
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')))
  WITH CHECK (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')));

GRANT SELECT, INSERT ON public.partner_stripe_accounts, public.partner_packages TO lobbystack_app;
-- An account row never moves to another partner. Reconnecting after a
-- disconnection points it at the new account.
GRANT UPDATE (stripe_account_id, country, currency, details_submitted, charges_enabled, payouts_enabled, disabled_reason, disconnected_at, synced_at, connected_by_user_id, updated_at) ON public.partner_stripe_accounts TO lobbystack_app;
-- A package's price, allowance, currency and Stripe objects are fixed once
-- it's made, since businesses may already pay them. It can be renamed, and
-- archived to stop selling it.
GRANT UPDATE (name, archived_at, updated_at) ON public.partner_packages TO lobbystack_app;
GRANT SELECT ON public.partner_stripe_accounts, public.partner_packages TO lobbystack_readonly;
