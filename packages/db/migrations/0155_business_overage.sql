-- A partner turns overage on or off for each of its businesses on a package,
-- and sets what each minute and chat past the package's allowance costs and
-- a monthly cap on what that comes to. The business pays it to the partner,
-- on the partner's own Stripe account (ADR 0009). Usage metering lets the
-- business keep answering past its allowance until its overage reaches the
-- cap, while the partner's pool has room. With overage off or at the cap,
-- calls forward and chat shows its "can't reply" message, as when the pool
-- runs out. A business billed outside LobbyStack has no overage.

-- Amounts are whole numbers of the minor unit of overage_currency, the
-- package's currency when the partner set them, so a business that moves to
-- a package in another currency has no overage until the partner sets it
-- again. A null cap means no cap. Overage is off until the partner turns it
-- on, so every business stays as it was.
ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS overage_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overage_currency varchar(3),
  ADD COLUMN IF NOT EXISTS overage_voice_minute_rate_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_chat_rate_minor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_cap_minor integer;

-- NOT VALID, so this file doesn't read every billing account while it holds
-- the lock that blocks them; 0157 validates the checks under a lighter lock.
-- New and changed rows are checked from here on.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.billing_accounts'::regclass AND conname = 'billing_accounts_overage_rates_check') THEN
    ALTER TABLE public.billing_accounts ADD CONSTRAINT billing_accounts_overage_rates_check CHECK (overage_voice_minute_rate_minor >= 0 AND overage_chat_rate_minor >= 0 AND (overage_cap_minor IS NULL OR overage_cap_minor >= 0)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.billing_accounts'::regclass AND conname = 'billing_accounts_overage_currency_check') THEN
    ALTER TABLE public.billing_accounts ADD CONSTRAINT billing_accounts_overage_currency_check CHECK (NOT overage_enabled OR overage_currency IS NOT NULL) NOT VALID;
  END IF;
END
$$;

-- Once a package business's usage is final, its event records what it put
-- past the business's own allowance and what that costs the business at the
-- terms it recorded, in the minor unit of the package's currency. The
-- month's other final usage counts first. Usage within the allowance
-- records 0, and usage no package prices records nothing.
ALTER TABLE public.billing_usage_events
  ADD COLUMN IF NOT EXISTS business_overage_quantity double precision,
  ADD COLUMN IF NOT EXISTS business_overage_minor double precision;

-- A business's own operators pass the billing account's RLS policy, so
-- without these they could turn on their own overage or change its price.
-- Only the system actor, which partner operations run as, sets them, as 0142
-- keeps the package and the subscription.
DROP TRIGGER IF EXISTS billing_accounts_keep_package_billing_before_insert ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_package_billing_before_insert
BEFORE INSERT ON public.billing_accounts
FOR EACH ROW
WHEN (NEW.package_id IS NOT NULL OR NEW.stripe_account_id IS NOT NULL OR NEW.stripe_customer_id IS NOT NULL OR NEW.stripe_subscription_id IS NOT NULL OR NEW.stripe_subscription_state IS NOT NULL
  OR NEW.stripe_current_period_end IS NOT NULL OR NEW.stripe_synced_at IS NOT NULL OR NEW.stripe_checkout_session_id IS NOT NULL OR NEW.stripe_checkout_url IS NOT NULL OR NEW.stripe_checkout_expires_at IS NOT NULL
  OR NEW.overage_enabled OR NEW.overage_currency IS NOT NULL OR NEW.overage_voice_minute_rate_minor <> 0 OR NEW.overage_chat_rate_minor <> 0 OR NEW.overage_cap_minor IS NOT NULL)
EXECUTE FUNCTION app.keep_package_billing_with_system();

DROP TRIGGER IF EXISTS billing_accounts_keep_package_billing_before_update ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_package_billing_before_update
BEFORE UPDATE ON public.billing_accounts
FOR EACH ROW
WHEN (OLD.package_id IS DISTINCT FROM NEW.package_id OR OLD.stripe_account_id IS DISTINCT FROM NEW.stripe_account_id OR OLD.stripe_customer_id IS DISTINCT FROM NEW.stripe_customer_id
  OR OLD.stripe_subscription_id IS DISTINCT FROM NEW.stripe_subscription_id OR OLD.stripe_subscription_state IS DISTINCT FROM NEW.stripe_subscription_state
  OR OLD.stripe_current_period_end IS DISTINCT FROM NEW.stripe_current_period_end OR OLD.stripe_synced_at IS DISTINCT FROM NEW.stripe_synced_at
  OR OLD.stripe_checkout_session_id IS DISTINCT FROM NEW.stripe_checkout_session_id OR OLD.stripe_checkout_url IS DISTINCT FROM NEW.stripe_checkout_url
  OR OLD.stripe_checkout_expires_at IS DISTINCT FROM NEW.stripe_checkout_expires_at
  OR OLD.overage_enabled IS DISTINCT FROM NEW.overage_enabled OR OLD.overage_currency IS DISTINCT FROM NEW.overage_currency
  OR OLD.overage_voice_minute_rate_minor IS DISTINCT FROM NEW.overage_voice_minute_rate_minor OR OLD.overage_chat_rate_minor IS DISTINCT FROM NEW.overage_chat_rate_minor
  OR OLD.overage_cap_minor IS DISTINCT FROM NEW.overage_cap_minor)
EXECUTE FUNCTION app.keep_package_billing_with_system();

DROP TRIGGER IF EXISTS billing_accounts_keep_package_billing_before_delete ON public.billing_accounts;
CREATE TRIGGER billing_accounts_keep_package_billing_before_delete
BEFORE DELETE ON public.billing_accounts
FOR EACH ROW
WHEN (OLD.package_id IS NOT NULL OR OLD.stripe_account_id IS NOT NULL OR OLD.stripe_customer_id IS NOT NULL OR OLD.stripe_subscription_id IS NOT NULL OR OLD.stripe_subscription_state IS NOT NULL
  OR OLD.stripe_current_period_end IS NOT NULL OR OLD.stripe_synced_at IS NOT NULL OR OLD.stripe_checkout_session_id IS NOT NULL OR OLD.stripe_checkout_url IS NOT NULL OR OLD.stripe_checkout_expires_at IS NOT NULL
  OR OLD.overage_enabled OR OLD.overage_currency IS NOT NULL OR OLD.overage_voice_minute_rate_minor <> 0 OR OLD.overage_chat_rate_minor <> 0 OR OLD.overage_cap_minor IS NOT NULL)
EXECUTE FUNCTION app.keep_package_billing_with_system();

-- The console's Businesses page also shows owners and admins each business's
-- overage, with the package's currency to read it in. The new columns change
-- the function's result, so it's dropped and made again, under 0142's rules:
-- only an owner or admin acting as themselves gets any rows.
DROP FUNCTION IF EXISTS app.list_partner_business_billing(uuid);
CREATE FUNCTION app.list_partner_business_billing(p_partner_id uuid)
RETURNS TABLE (
  business_id uuid,
  package_id uuid,
  package_name text,
  package_currency varchar,
  subscription_state varchar,
  overage_enabled boolean,
  overage_currency varchar,
  overage_voice_minute_rate_minor integer,
  overage_chat_rate_minor integer,
  overage_cap_minor integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, package.id, package.name, package.currency, account.stripe_subscription_state,
    account.overage_enabled, account.overage_currency, account.overage_voice_minute_rate_minor, account.overage_chat_rate_minor, account.overage_cap_minor
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
