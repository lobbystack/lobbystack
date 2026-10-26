-- A partner's businesses draw on its pool: the voice minutes and website chats
-- its tier includes each month, shared by all of them. Usage metering grants
-- a business the smaller of what its own allowance and the pool have left,
-- taking the business's lock and then the pool's, in that order every time.
-- Past the pool, overage bills to the partner through Polar at its tier's
-- rates, up to the monthly cap the partner sets. Overage is on unless the
-- partner turns it off, and Free has none. With overage off or at the cap,
-- calls forward and chat shows its "can't reply" message.
--
-- The pool keeps running counts per partner and month, which every
-- reservation, top-up and correction moves, so no reservation replays the
-- partner's other businesses' events. A business's transaction can't read
-- those businesses at all, so it reaches the pool only through the functions
-- below. Usage from before this file isn't in the counts.

-- Pool overage is on by default. The partner's owners turn it off, or cap
-- what it costs each month in US cents. Null means no cap. A partner Polar
-- never billed gets a row, on Free, when an owner first changes them.
ALTER TABLE public.partner_billing_accounts
  ADD COLUMN IF NOT EXISTS pool_overage_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pool_overage_cap_cents integer CHECK (pool_overage_cap_cents >= 0);

-- What the partner's businesses used each month, as the pool counts it.
-- Voice seconds count open reservations too, so calls at once share what's
-- left; the final seconds are what ended calls used. Overage is what final
-- usage went past the pool while the partner paid for overage, and what it
-- costs at the tier's rates, in US cents, which the cap limits. The alerts
-- the month already sent the partner's owners and admins are keyed by what
-- crossed which share of what, with when each was queued, so each goes out
-- once.
CREATE TABLE IF NOT EXISTS public.partner_usage_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  period_key varchar(16) NOT NULL,
  voice_seconds_used double precision NOT NULL DEFAULT 0 CHECK (voice_seconds_used >= 0),
  voice_seconds_final double precision NOT NULL DEFAULT 0 CHECK (voice_seconds_final >= 0),
  chats_used double precision NOT NULL DEFAULT 0 CHECK (chats_used >= 0),
  overage_voice_seconds double precision NOT NULL DEFAULT 0 CHECK (overage_voice_seconds >= 0),
  overage_chats double precision NOT NULL DEFAULT 0 CHECK (overage_chats >= 0),
  overage_spend_cents double precision NOT NULL DEFAULT 0 CHECK (overage_spend_cents >= 0),
  alerts_sent jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(alerts_sent) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_usage_months_partner_period_unique ON public.partner_usage_months (partner_id, period_key);

ALTER TABLE public.partner_usage_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_usage_months FORCE ROW LEVEL SECURITY;

-- No runtime role reads or writes the table itself: the functions below do,
-- as its owner. The policy lets the readonly role see what the partner's
-- billing account policy would.
DROP POLICY IF EXISTS partner_usage_months_read ON public.partner_usage_months;
CREATE POLICY partner_usage_months_read ON public.partner_usage_months FOR SELECT
  USING (app.current_actor_type() IN ('system', 'worker') OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IS NOT NULL));
GRANT SELECT ON public.partner_usage_months TO lobbystack_readonly;

-- Each usage event records the terms in force when it happened: the
-- business's allowance and overage, and the pool's when the usage draws on
-- one. Voice and chat usage of a partner's business names the partner whose
-- pool it drew on, which stays the same if the business leaves the partner
-- later. Once the event is final, it records what it put past the pool and
-- what that costs the partner. sync_status then follows that overage's
-- report to Polar, since the host bills the partner and never its business.
ALTER TABLE public.billing_usage_events
  ADD COLUMN IF NOT EXISTS terms_at_record_time jsonb,
  ADD COLUMN IF NOT EXISTS pool_partner_id uuid,
  ADD COLUMN IF NOT EXISTS pool_overage_quantity double precision,
  ADD COLUMN IF NOT EXISTS pool_overage_cents double precision;

-- Whether the current transaction may use the partner's pool: the worker,
-- inside one of the partner's businesses or one whose usage drew on the
-- pool that month before it left the partner. Only the functions below call
-- this, as their owner, so it reads the settings rather than the role.
CREATE OR REPLACE FUNCTION app.can_use_partner_pool(target_partner_id uuid, target_period_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, app, pg_catalog
AS $$
  SELECT current_setting('app.actor_type', true) = 'worker'
    AND NULLIF(current_setting('app.business_id', true), '') IS NOT NULL
    AND (
      app.business_partner(NULLIF(current_setting('app.business_id', true), '')::uuid) = target_partner_id
      OR EXISTS (
        SELECT 1
        FROM public.billing_usage_events event
        WHERE event.business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
          AND event.period_key = target_period_key
          AND event.pool_partner_id = target_partner_id
      )
    )
$$;
REVOKE ALL ON FUNCTION app.can_use_partner_pool(uuid, text) FROM PUBLIC;

-- The pool's terms and this month's counts: the tier Polar sold the partner
-- and its subscription state, the pool of the tier in force as the worker
-- last reconciled it, the partner's overage switch and cap, the counts, and
-- the alerts the month already sent.
-- A partner Polar never billed has no account, and a month with no usage no
-- counts; both answer nulls and zeros. It answers the worker inside one of
-- the partner's businesses, for usage metering, and an operator on the
-- partner's team, for the console's Billing page. Anyone else gets no row.
CREATE OR REPLACE FUNCTION app.partner_pool_month(target_partner_id uuid, target_period_key text)
RETURNS TABLE (
  tier text,
  subscription_state text,
  pool_voice_seconds integer,
  pool_chats integer,
  overage_enabled boolean,
  overage_cap_cents integer,
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
CREATE OR REPLACE FUNCTION app.lock_partner_pool(target_partner_id uuid, target_period_key text)
RETURNS TABLE (
  tier text,
  subscription_state text,
  pool_voice_seconds integer,
  pool_chats integer,
  overage_enabled boolean,
  overage_cap_cents integer,
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

-- Moves the month's counts by what one event changed. It takes the pool's
-- lock too, which the caller already holds when it checked what the pool had
-- left. No count goes below zero. A call that ends after its business left a
-- partner that's since gone moves no counts.
CREATE OR REPLACE FUNCTION app.record_partner_pool_usage(
  target_partner_id uuid,
  target_period_key text,
  p_voice_seconds double precision,
  p_voice_seconds_final double precision,
  p_chats double precision,
  p_overage_voice_seconds double precision,
  p_overage_chats double precision,
  p_overage_spend_cents double precision
)
RETURNS void
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
  IF NOT EXISTS (SELECT 1 FROM public.partners partner WHERE partner.id = target_partner_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.partner_usage_months AS month (partner_id, period_key, voice_seconds_used, voice_seconds_final, chats_used, overage_voice_seconds, overage_chats, overage_spend_cents)
  VALUES (target_partner_id, target_period_key, GREATEST(0, p_voice_seconds), GREATEST(0, p_voice_seconds_final), GREATEST(0, p_chats), GREATEST(0, p_overage_voice_seconds), GREATEST(0, p_overage_chats), GREATEST(0, p_overage_spend_cents))
  ON CONFLICT (partner_id, period_key) DO UPDATE SET
    voice_seconds_used = GREATEST(0, month.voice_seconds_used + p_voice_seconds),
    voice_seconds_final = GREATEST(0, month.voice_seconds_final + p_voice_seconds_final),
    chats_used = GREATEST(0, month.chats_used + p_chats),
    overage_voice_seconds = GREATEST(0, month.overage_voice_seconds + p_overage_voice_seconds),
    overage_chats = GREATEST(0, month.overage_chats + p_overage_chats),
    overage_spend_cents = GREATEST(0, month.overage_spend_cents + p_overage_spend_cents),
    updated_at = now();
END
$$;
REVOKE ALL ON FUNCTION app.record_partner_pool_usage(uuid, text, double precision, double precision, double precision, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_partner_pool_usage(uuid, text, double precision, double precision, double precision, double precision, double precision, double precision) TO lobbystack_worker;

-- An owner turns the partner's pool overage on or off, and sets or clears its
-- monthly cap. Only the worker writes the rest of the billing account, from
-- Polar's events, so this writes only these two columns. A partner Polar
-- never billed gets its account here, on Free's pool of 1,800 voice seconds
-- and 50 chats with no included number, as partnerTierCatalog sets it; the
-- worker's reconcile keeps both settings.
CREATE OR REPLACE FUNCTION app.set_partner_pool_overage(target_partner_id uuid, p_enabled boolean, p_cap_cents integer)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
BEGIN
  IF current_setting('app.actor_type', true) IS DISTINCT FROM 'operator' OR app.partner_role(target_partner_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL OR (p_cap_cents IS NOT NULL AND p_cap_cents < 0) THEN
    RAISE EXCEPTION 'invalid_pool_overage' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.partner_billing_accounts AS account (partner_id, billing_key, pool_voice_seconds, pool_chats, included_numbers, pool_overage_enabled, pool_overage_cap_cents)
  VALUES (target_partner_id, 'partner:' || target_partner_id::text, 1800, 50, 0, p_enabled, p_cap_cents)
  ON CONFLICT (partner_id) DO UPDATE SET
    pool_overage_enabled = EXCLUDED.pool_overage_enabled,
    pool_overage_cap_cents = EXCLUDED.pool_overage_cap_cents,
    updated_at = now();
END
$$;
REVOKE ALL ON FUNCTION app.set_partner_pool_overage(uuid, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_partner_pool_overage(uuid, boolean, integer) TO lobbystack_app;

-- Marks the month's alerts in alert_keys as sent, and answers the ones it
-- marked now: an alert already sent this month, or a month with no counts
-- yet, answers none. Usage metering calls it under the pool's lock when an
-- event's final usage crosses 80% or 100% of the pool or of the cap, and
-- queues an email for each alert it gets back, so each goes out once.
CREATE OR REPLACE FUNCTION app.claim_partner_pool_alerts(target_partner_id uuid, target_period_key text, alert_keys text[])
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
DECLARE
  claimed text[];
BEGIN
  IF NOT app.can_use_partner_pool(target_partner_id, target_period_key) THEN
    RAISE EXCEPTION 'partner_pool_unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-pool:' || target_partner_id::text || ':' || target_period_key, 0));
  SELECT COALESCE(array_agg(DISTINCT alert.key), '{}') INTO claimed
  FROM unnest(COALESCE(alert_keys, '{}')) AS alert(key)
  INNER JOIN public.partner_usage_months month ON month.partner_id = target_partner_id AND month.period_key = target_period_key
  WHERE NOT month.alerts_sent ? alert.key;
  IF cardinality(claimed) = 0 THEN
    RETURN claimed;
  END IF;
  UPDATE public.partner_usage_months month
  SET alerts_sent = month.alerts_sent || (SELECT jsonb_object_agg(alert.key, now()) FROM unnest(claimed) AS alert(key)),
    updated_at = now()
  WHERE month.partner_id = target_partner_id AND month.period_key = target_period_key;
  RETURN claimed;
END
$$;
REVOKE ALL ON FUNCTION app.claim_partner_pool_alerts(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_partner_pool_alerts(uuid, text, text[]) TO lobbystack_worker;

-- Who gets the pool's alerts: the partner's active owners and admins, with
-- the address, name and language each email goes out in, and the partner's
-- name. Members work inside businesses and never see billing, so they get
-- none. RLS hides partner members and their accounts from a business's
-- transaction, so this reads as its owner, for usage metering inside one of
-- the partner's businesses.
CREATE OR REPLACE FUNCTION app.partner_pool_alert_recipients(target_partner_id uuid, target_period_key text)
RETURNS TABLE (user_id uuid, email text, name text, preferred_locale text, partner_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  SELECT person.id, person.email, person.name, person.preferred_locale::text, partner.name
  FROM public.partners partner
  INNER JOIN public.partner_members member ON member.partner_id = partner.id AND member.status = 'active' AND member.role IN ('owner', 'admin')
  INNER JOIN public.users person ON person.id = member.user_id
  WHERE partner.id = target_partner_id
    AND app.can_use_partner_pool(target_partner_id, target_period_key)
  ORDER BY member.created_at, person.id
$$;
REVOKE ALL ON FUNCTION app.partner_pool_alert_recipients(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_pool_alert_recipients(uuid, text) TO lobbystack_worker;

-- The calls the partner's businesses have open now: GPT-Live calls, phone
-- and browser, that started after started_after and haven't ended, leaving
-- out exclude_call_id, the call reserving now. No call runs longer than
-- MAX_PHONE_CALL_MS, so the caller passes that far back, and a call left
-- open by a worker that died stops counting then. Usage metering counts
-- them under the pool's lock before it reserves a new call's first minutes,
-- so two calls at once count each other. The partial index on open live
-- calls finds them.
CREATE OR REPLACE FUNCTION app.count_partner_open_calls(target_partner_id uuid, target_period_key text, started_after timestamptz, exclude_call_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
BEGIN
  IF NOT app.can_use_partner_pool(target_partner_id, target_period_key) THEN
    RAISE EXCEPTION 'partner_pool_unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT count(*)::integer
    FROM public.calls call
    INNER JOIN public.businesses business ON business.id = call.business_id
    WHERE business.partner_id = target_partner_id
      AND call.ended_at IS NULL
      AND call.provider = 'openai_live'
      AND call.started_at > started_after
      AND call.id IS DISTINCT FROM exclude_call_id
  );
END
$$;
REVOKE ALL ON FUNCTION app.count_partner_open_calls(uuid, text, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.count_partner_open_calls(uuid, text, timestamptz, uuid) TO lobbystack_worker;
