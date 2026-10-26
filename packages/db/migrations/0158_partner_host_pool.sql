-- A self-hoster who bills partners no tier can still limit a partner's pool:
-- the voice minutes and website chats its businesses share each month. The
-- host sets the pool, or clears it, with `pnpm partner-pool:set`. Unset means
-- no limit, as before. Nothing prices overage without tier billing, so the
-- pool is the limit: no overage and no cap. At the pool, calls forward and
-- website chat shows its "can't reply" message, as on Free.
--
-- The pool of the tier in force stays in pool_voice_seconds and pool_chats,
-- which every reconcile rewrites from the tier catalog. The host's pool gets
-- its own columns, so a deployment that stops billing tiers doesn't hold its
-- partners to their last tier's pool, and a reconcile never touches what the
-- host set. While the deployment bills tiers, usage metering ignores them.
-- The table holds one row per partner, so checking them under the lock is quick.
ALTER TABLE public.partner_billing_accounts
  ADD COLUMN IF NOT EXISTS host_pool_voice_seconds integer CHECK (host_pool_voice_seconds >= 0),
  ADD COLUMN IF NOT EXISTS host_pool_chats integer CHECK (host_pool_chats >= 0);

-- The pool functions answer the host's pool beside the tier's. Their result
-- gains two columns, so they're made again, with the same grants.
DROP FUNCTION IF EXISTS app.lock_partner_pool(uuid, text);
DROP FUNCTION IF EXISTS app.partner_pool_month(uuid, text);

-- The pool's terms and this month's counts: the tier Polar sold the partner
-- and its subscription state, the pool of the tier in force as the worker
-- last reconciled it, the partner's overage switch and cap, the pool the host
-- set, the counts, and the alerts the month already sent.
-- A partner Polar never billed has no account, and a month with no usage no
-- counts; both answer nulls and zeros. It answers the worker inside one of
-- the partner's businesses, for usage metering, and an operator on the
-- partner's team, for the console's Billing page. Anyone else gets no row.
CREATE FUNCTION app.partner_pool_month(target_partner_id uuid, target_period_key text)
RETURNS TABLE (
  tier text,
  subscription_state text,
  pool_voice_seconds integer,
  pool_chats integer,
  overage_enabled boolean,
  overage_cap_cents integer,
  host_pool_voice_seconds integer,
  host_pool_chats integer,
  voice_seconds_used double precision,
  voice_seconds_final double precision,
  chats_used double precision,
  overage_voice_seconds double precision,
  overage_chats double precision,
  overage_spend_cents double precision,
  alerts_sent jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  SELECT account.tier::text, account.subscription_state::text, account.pool_voice_seconds, account.pool_chats,
    COALESCE(account.pool_overage_enabled, true), account.pool_overage_cap_cents,
    account.host_pool_voice_seconds, account.host_pool_chats,
    COALESCE(month.voice_seconds_used, 0), COALESCE(month.voice_seconds_final, 0), COALESCE(month.chats_used, 0),
    COALESCE(month.overage_voice_seconds, 0), COALESCE(month.overage_chats, 0), COALESCE(month.overage_spend_cents, 0),
    COALESCE(month.alerts_sent, '{}'::jsonb)
  FROM (SELECT target_partner_id AS partner_id) target
  LEFT JOIN public.partner_billing_accounts account ON account.partner_id = target.partner_id
  LEFT JOIN public.partner_usage_months month ON month.partner_id = target.partner_id AND month.period_key = target_period_key
  WHERE app.can_use_partner_pool(target_partner_id, target_period_key)
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; read the setting.
    OR (current_setting('app.actor_type', true) = 'operator' AND app.partner_role(target_partner_id) IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION app.partner_pool_month(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_pool_month(uuid, text) TO lobbystack_app, lobbystack_worker;

-- Takes the pool's lock for the month and answers as app.partner_pool_month
-- does. Usage metering calls it after it takes the business's own lock, so
-- two of the partner's businesses reserve in turn and neither can take what
-- the other just did. The lock is billing-pool:<partner id>:<period key>.
CREATE FUNCTION app.lock_partner_pool(target_partner_id uuid, target_period_key text)
RETURNS TABLE (
  tier text,
  subscription_state text,
  pool_voice_seconds integer,
  pool_chats integer,
  overage_enabled boolean,
  overage_cap_cents integer,
  host_pool_voice_seconds integer,
  host_pool_chats integer,
  voice_seconds_used double precision,
  voice_seconds_final double precision,
  chats_used double precision,
  overage_voice_seconds double precision,
  overage_chats double precision,
  overage_spend_cents double precision,
  alerts_sent jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
BEGIN
  IF NOT app.can_use_partner_pool(target_partner_id, target_period_key) THEN
    RAISE EXCEPTION 'partner_pool_unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-pool:' || target_partner_id::text || ':' || target_period_key, 0));
  RETURN QUERY SELECT * FROM app.partner_pool_month(target_partner_id, target_period_key);
END
$$;
REVOKE ALL ON FUNCTION app.lock_partner_pool(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_partner_pool(uuid, text) TO lobbystack_worker;

-- The host sets the partner's pool, a null kind having no limit, or clears
-- it with two nulls. Only the host's own tooling acts as the system actor,
-- so neither the partner's team nor a business's operators can change it.
-- While the worker last recorded that the deployment bills tiers, the tier
-- sets the pool, so this refuses a limit there and still lets the host clear
-- one. A partner Polar never billed gets its account here, on Free's pool of
-- 1,800 voice seconds and 50 chats with no included number, as
-- partnerTierCatalog sets it; the worker's reconcile keeps the host's pool.
CREATE OR REPLACE FUNCTION app.set_partner_host_pool(target_partner_id uuid, p_voice_seconds integer, p_chats integer)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
BEGIN
  IF current_setting('app.actor_type', true) IS DISTINCT FROM 'system' THEN
    RAISE EXCEPTION 'host_only' USING ERRCODE = '42501';
  END IF;
  IF (p_voice_seconds IS NOT NULL AND p_voice_seconds < 0) OR (p_chats IS NOT NULL AND p_chats < 0) THEN
    RAISE EXCEPTION 'invalid_host_pool' USING ERRCODE = '22023';
  END IF;
  IF (p_voice_seconds IS NOT NULL OR p_chats IS NOT NULL) AND app.partner_tier_billing() THEN
    RAISE EXCEPTION 'tier_billing_on' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partners partner WHERE partner.id = target_partner_id) THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.partner_billing_accounts AS account (partner_id, billing_key, pool_voice_seconds, pool_chats, included_numbers, host_pool_voice_seconds, host_pool_chats)
  VALUES (target_partner_id, 'partner:' || target_partner_id::text, 1800, 50, 0, p_voice_seconds, p_chats)
  ON CONFLICT (partner_id) DO UPDATE SET
    host_pool_voice_seconds = EXCLUDED.host_pool_voice_seconds,
    host_pool_chats = EXCLUDED.host_pool_chats,
    updated_at = now();
END
$$;
REVOKE ALL ON FUNCTION app.set_partner_host_pool(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_partner_host_pool(uuid, integer, integer) TO lobbystack_app;
