-- A partner's business pays its partner for a package through the partner's
-- own Stripe account (ADR 0009), or the partner bills it outside LobbyStack.
-- Its billing account names the package it's sold and keeps what Stripe last
-- said of its subscription, which lives on the partner's account as a direct
-- charge. A partner's business with no package is billed outside
-- LobbyStack: live, with no allowance of its own. Every partner business
-- made before this file has none, so each stays as it was.

ALTER TABLE public.billing_accounts
  -- The package the partner sells the business. Packages are archived, never
  -- deleted, so this only clears when the partner itself goes.
  ADD COLUMN IF NOT EXISTS package_id uuid,
  -- The connected account the business's customer and subscription live on.
  ADD COLUMN IF NOT EXISTS stripe_account_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar(255),
  -- Stripe's own status for the subscription: active, trialing, past_due, canceled, ...
  ADD COLUMN IF NOT EXISTS stripe_subscription_state varchar(32),
  ADD COLUMN IF NOT EXISTS stripe_current_period_end timestamptz,
  -- When the deployment last read the subscription from Stripe, so an older
  -- read that finishes late never overwrites a newer one.
  ADD COLUMN IF NOT EXISTS stripe_synced_at timestamptz,
  -- The checkout the business was last sent to, reused while it's open so
  -- two clicks can't start two subscriptions.
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_checkout_url text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_expires_at timestamptz;

-- NOT VALID, so this file doesn't read every billing account while it holds
-- the lock that blocks them; 0143 validates the key under a lighter lock.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.billing_accounts'::regclass AND conname = 'billing_accounts_package_id_fkey') THEN
    ALTER TABLE public.billing_accounts ADD CONSTRAINT billing_accounts_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.partner_packages(id) ON DELETE SET NULL NOT VALID;
  END IF;
END
$$;

-- A business is sold only its own partner's packages, so it always pays its
-- own partner. It reads the package and the business as their owner, since
-- the business's own transaction can't see its partner's packages.
CREATE OR REPLACE FUNCTION app.check_billing_account_package()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.partner_packages package
    JOIN public.businesses business ON business.partner_id = package.partner_id
    WHERE package.id = NEW.package_id
      AND business.id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'package_partner_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.check_billing_account_package() FROM PUBLIC;

DROP TRIGGER IF EXISTS billing_accounts_check_package_before_write ON public.billing_accounts;
CREATE TRIGGER billing_accounts_check_package_before_write
BEFORE INSERT OR UPDATE OF package_id, business_id ON public.billing_accounts
FOR EACH ROW
WHEN (NEW.package_id IS NOT NULL)
EXECUTE FUNCTION app.check_billing_account_package();

-- A business's own operators pass the billing account's RLS policy, and both
-- runtime roles may write it, so without this they could give themselves a
-- package or a live subscription, or delete the account to leave a package
-- business billed outside LobbyStack. Only the system actor, which partner
-- operations, checkouts and the Connect webhook run as, sets these columns or
-- deletes an account that has them. Deleting a business still deletes its
-- account: the cascade runs as the table's owner.
CREATE OR REPLACE FUNCTION app.keep_package_billing_with_system()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_user IN ('lobbystack_app', 'lobbystack_worker') AND app.current_actor_type() <> 'system' THEN
    RAISE EXCEPTION 'package_billing_locked' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.keep_package_billing_with_system() FROM PUBLIC;

DROP TRIGGER IF EXISTS billing_accounts_keep_package_billing_before_insert ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_package_billing_before_insert
BEFORE INSERT ON public.billing_accounts
FOR EACH ROW
WHEN (NEW.package_id IS NOT NULL OR NEW.stripe_account_id IS NOT NULL OR NEW.stripe_customer_id IS NOT NULL OR NEW.stripe_subscription_id IS NOT NULL OR NEW.stripe_subscription_state IS NOT NULL
  OR NEW.stripe_current_period_end IS NOT NULL OR NEW.stripe_synced_at IS NOT NULL OR NEW.stripe_checkout_session_id IS NOT NULL OR NEW.stripe_checkout_url IS NOT NULL OR NEW.stripe_checkout_expires_at IS NOT NULL)
EXECUTE FUNCTION app.keep_package_billing_with_system();

DROP TRIGGER IF EXISTS billing_accounts_keep_package_billing_before_update ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_package_billing_before_update
BEFORE UPDATE ON public.billing_accounts
FOR EACH ROW
WHEN (OLD.package_id IS DISTINCT FROM NEW.package_id OR OLD.stripe_account_id IS DISTINCT FROM NEW.stripe_account_id OR OLD.stripe_customer_id IS DISTINCT FROM NEW.stripe_customer_id
  OR OLD.stripe_subscription_id IS DISTINCT FROM NEW.stripe_subscription_id OR OLD.stripe_subscription_state IS DISTINCT FROM NEW.stripe_subscription_state
  OR OLD.stripe_current_period_end IS DISTINCT FROM NEW.stripe_current_period_end OR OLD.stripe_synced_at IS DISTINCT FROM NEW.stripe_synced_at
  OR OLD.stripe_checkout_session_id IS DISTINCT FROM NEW.stripe_checkout_session_id OR OLD.stripe_checkout_url IS DISTINCT FROM NEW.stripe_checkout_url
  OR OLD.stripe_checkout_expires_at IS DISTINCT FROM NEW.stripe_checkout_expires_at)
EXECUTE FUNCTION app.keep_package_billing_with_system();

DROP TRIGGER IF EXISTS billing_accounts_keep_package_billing_before_delete ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_package_billing_before_delete
BEFORE DELETE ON public.billing_accounts
FOR EACH ROW
WHEN (OLD.package_id IS NOT NULL OR OLD.stripe_account_id IS NOT NULL OR OLD.stripe_customer_id IS NOT NULL OR OLD.stripe_subscription_id IS NOT NULL OR OLD.stripe_subscription_state IS NOT NULL
  OR OLD.stripe_current_period_end IS NOT NULL OR OLD.stripe_synced_at IS NOT NULL OR OLD.stripe_checkout_session_id IS NOT NULL OR OLD.stripe_checkout_url IS NOT NULL OR OLD.stripe_checkout_expires_at IS NOT NULL)
EXECUTE FUNCTION app.keep_package_billing_with_system();

-- Usage metering reads a business's allowance from its package, as the
-- worker and as the business's own operators. Neither is on the partner's
-- team, so this lets each read the one package the current business's
-- billing account names, and nothing else of the partner's.
DROP POLICY IF EXISTS partner_packages_business_read ON public.partner_packages;
CREATE POLICY partner_packages_business_read ON public.partner_packages FOR SELECT
  USING (
    (app.current_actor_type() = 'worker' OR (app.current_actor_type() = 'operator' AND app.has_business_membership(app.current_business_id())))
    AND EXISTS (
      SELECT 1 FROM public.billing_accounts account
      WHERE account.business_id = app.current_business_id()
        AND account.package_id = partner_packages.id
    )
  );
GRANT SELECT ON public.partner_packages TO lobbystack_worker;

-- A partner's business is live while it's billed outside LobbyStack, which
-- is when it has no package, or while its package's Stripe subscription is
-- paying, past_due included, as loadEntitlement says in packages/domain. A
-- deployment without Stripe Connect bills every partner business outside
-- LobbyStack, which only loadEntitlement can tell, since it reads the
-- deployment's configuration: there this still asks for the subscription,
-- and only the number claims ask it, which 0135 refuses partner businesses
-- on the cloud. A direct business keeps the rule 0127 set.
CREATE OR REPLACE FUNCTION app.has_live_entitlement(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN business.partner_id IS NOT NULL THEN account.package_id IS NULL OR account.stripe_subscription_state IN ('active', 'trialing', 'past_due')
      ELSE account.plan IN ('starter', 'pro', 'enterprise') AND account.subscription_state IN ('active', 'trialing', 'past_due')
    END
    FROM public.businesses business
    LEFT JOIN public.billing_accounts account ON account.business_id = business.id
    WHERE business.id = target_business_id
  ), false)
$$;
REVOKE ALL ON FUNCTION app.has_live_entitlement(uuid) FROM PUBLIC;

-- The console's Businesses page shows owners and admins what each business
-- is sold and whether it pays. Partner members aren't on the businesses'
-- teams, so RLS shows them none of their billing accounts; this answers
-- instead, only for an owner or admin acting as themselves. Members never
-- see it, since it names packages.
CREATE OR REPLACE FUNCTION app.list_partner_business_billing(p_partner_id uuid)
RETURNS TABLE (
  business_id uuid,
  package_id uuid,
  package_name text,
  subscription_state varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, package.id, package.name, account.stripe_subscription_state
  FROM public.businesses business
  LEFT JOIN public.billing_accounts account ON account.business_id = business.id
  LEFT JOIN public.partner_packages package ON package.id = account.package_id
  WHERE business.partner_id = p_partner_id
    AND business.status = 'active'
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'operator'
    AND app.partner_role(p_partner_id) IN ('owner', 'admin')
  ORDER BY business.id
$$;
REVOKE ALL ON FUNCTION app.list_partner_business_billing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_partner_business_billing(uuid) TO lobbystack_app;
