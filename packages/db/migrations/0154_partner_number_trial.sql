-- A partner on Free gets one 14-day trial number, ever, for one of its
-- businesses, on the cloud while the deployment bills tiers. It runs by the
-- rules of the host's trial: the owner's verified mobile, 14 days, calls that
-- transfer only to that mobile, and Free's minutes, which here are the pool's.
-- A paid tier includes numbers instead, and the trial number becomes one of
-- them when the partner pays. A partner's business still never gets the
-- host's own trial, which 0147 refused with every trial claim.

-- The partner whose trial a trial is. Each trial of a partner's business
-- names its partner, set from the business as it's reserved, whichever claim
-- function reserves it. A business its partner releases keeps its trial, which
-- still counts as the partner's.
ALTER TABLE public.number_trials ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

-- At most one trial a partner hasn't lost to a failed purchase. The check on
-- the claim refuses a second first; this keeps two claims at once out too.
CREATE UNIQUE INDEX IF NOT EXISTS number_trials_partner_unique ON public.number_trials (partner_id) WHERE partner_id IS NOT NULL AND status <> 'failed';

-- When the partner's trial number started. Deleting the business that held it
-- deletes its trial, so the partner keeps this to stay at one trial, ever.
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS number_trial_started_at timestamptz;

-- Both runtime roles write trials, so the database sets the partner from the
-- business and keeps it: no update moves a trial to another partner or off
-- its partner. Deleting the partner itself clears it, as the foreign key
-- says, so the partner's deletion goes through.
CREATE OR REPLACE FUNCTION app.set_number_trial_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.partner_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.partners partner WHERE partner.id = OLD.partner_id) THEN
      RETURN NEW;
    END IF;
    NEW.partner_id := OLD.partner_id;
  ELSE
    NEW.partner_id := app.business_partner(NEW.business_id);
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.set_number_trial_partner() FROM PUBLIC;

DROP TRIGGER IF EXISTS number_trials_partner_before_insert ON public.number_trials;
DROP TRIGGER IF EXISTS number_trials_partner_before_write ON public.number_trials;
CREATE TRIGGER number_trials_partner_before_write
BEFORE INSERT OR UPDATE OF partner_id ON public.number_trials
FOR EACH ROW
EXECUTE FUNCTION app.set_number_trial_partner();

-- Records on the partner that its trial started, once the worker bought the
-- number. A failed purchase never gets here, so it leaves the trial unused.
CREATE OR REPLACE FUNCTION app.record_partner_number_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
BEGIN
  UPDATE public.partners SET number_trial_started_at = COALESCE(NEW.started_at, now())
  WHERE id = NEW.partner_id AND number_trial_started_at IS NULL;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION app.record_partner_number_trial() FROM PUBLIC;

DROP TRIGGER IF EXISTS number_trials_partner_after_start ON public.number_trials;
CREATE TRIGGER number_trials_partner_after_start
AFTER INSERT OR UPDATE OF status ON public.number_trials
FOR EACH ROW
WHEN (NEW.partner_id IS NOT NULL AND NEW.status IN ('active', 'ended', 'converted', 'released'))
EXECUTE FUNCTION app.record_partner_number_trial();

-- Whether the partner had its trial: one started, or one reserved that's
-- still buying its number. A reserved trial whose claim failed or stalled,
-- reserved for 15 minutes or provisioning for 30, doesn't count: the next
-- trial claim of the partner's businesses expires it. Only the functions
-- below call this, as their owner.
CREATE OR REPLACE FUNCTION app.partner_number_trial_used(target_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM public.partners partner WHERE partner.id = target_partner_id AND partner.number_trial_started_at IS NOT NULL)
    OR EXISTS (
      SELECT 1
      FROM public.number_trials trial
      LEFT JOIN public.onboarding_number_claim_events claim ON claim.id = trial.claim_id
      WHERE trial.partner_id = target_partner_id
        AND trial.status <> 'failed'
        AND NOT (trial.status = 'reserved' AND (
          claim.id IS NULL
          OR claim.status = 'failed'
          OR (claim.status = 'reserved' AND claim.reserved_at <= now() - interval '15 minutes')
          OR (claim.status = 'provisioning' AND claim.updated_at <= now() - interval '30 minutes')
        ))
    )
$$;
REVOKE ALL ON FUNCTION app.partner_number_trial_used(uuid) FROM PUBLIC;

-- 0147's standing, plus whether the partner still has its trial number: on
-- Free, with no trial yet. The number search offers it, and the claim checks
-- the same under the partner's lock. The new column changes the function's
-- result, so it's dropped and made again.
DROP FUNCTION IF EXISTS app.partner_number_standing(uuid);
CREATE FUNCTION app.partner_number_standing(target_partner_id uuid)
RETURNS TABLE (held integer, included integer, paid_tier boolean, counted boolean, trial_available boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  SELECT app.count_partner_numbers(target_partner_id), app.partner_included_numbers(target_partner_id), app.partner_paid_tier(target_partner_id), app.partner_tier_billing(),
    NOT app.partner_paid_tier(target_partner_id) AND NOT app.partner_number_trial_used(target_partner_id)
  WHERE app.business_partner(NULLIF(current_setting('app.business_id', true), '')::uuid) = target_partner_id
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; read the setting.
    OR (current_setting('app.actor_type', true) = 'operator' AND app.partner_role(target_partner_id) IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION app.partner_number_standing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_number_standing(uuid) TO lobbystack_app, lobbystack_worker;

-- The business that holds the partner's trial number while it can still
-- become one of the partner's numbers: running, or ended with the number not
-- released yet. When the partner pays for a tier, the worker converts it, as
-- a direct business's trial converts when it pays. The worker reconciles the
-- tier with no business in its context, and RLS hides the trials, so this
-- reads as its owner, for the worker only.
CREATE OR REPLACE FUNCTION app.partner_number_trial_business(target_partner_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  SELECT trial.business_id
  FROM public.number_trials trial
  WHERE trial.partner_id = target_partner_id
    AND trial.status IN ('active', 'ended')
    AND current_setting('app.actor_type', true) = 'worker'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.partner_number_trial_business(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_number_trial_business(uuid) TO lobbystack_worker;

-- 0127's trial claim, which refused a business that's live. A partner's
-- business is live while it's billed outside LobbyStack, so only a direct
-- business's live entitlement makes the trial unneeded now.
CREATE OR REPLACE FUNCTION app.reserve_trial_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text, request_ip_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE new_claim_id uuid; business_row public.businesses%ROWTYPE; user_phone text; user_phone_verified_at timestamptz;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('phone-claim:' || target_business_id::text, 0));
  -- The once-per-user, per-phone and per-network checks below read other businesses' trials,
  -- so trial claims take turns: two workspaces claiming at once can't both pass them.
  PERFORM pg_advisory_xact_lock(hashtextextended('number-trial-claims', 0));
  SELECT id INTO new_claim_id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND idempotency_key = request_key;
  IF new_claim_id IS NOT NULL THEN RETURN new_claim_id; END IF;
  UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = CASE WHEN status = 'reserved' THEN 'Number claim reservation expired.' ELSE 'Number provisioning stalled.' END, updated_at = now()
    WHERE business_id = target_business_id AND purpose = 'onboarding'
      AND ((status = 'reserved' AND reserved_at <= now() - interval '15 minutes') OR (status = 'provisioning' AND updated_at <= now() - interval '30 minutes'));
  UPDATE public.number_trials SET status = 'failed', updated_at = now()
    WHERE business_id = target_business_id AND status = 'reserved'
      AND claim_id IN (SELECT id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND status = 'failed');
  IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose = 'onboarding' AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'number_claim_in_progress' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO business_row FROM public.businesses WHERE id = target_business_id;
  IF business_row.onboarding_stage NOT IN ('phone_number','attribution','complete') THEN RAISE EXCEPTION 'invalid_onboarding_stage' USING ERRCODE = 'P0001'; END IF;
  IF business_row.deployment_mode <> 'cloud' THEN RAISE EXCEPTION 'trial_not_available' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.phone_numbers WHERE business_id = target_business_id AND status IN ('active','provisioning')) THEN RAISE EXCEPTION 'business_number_exists' USING ERRCODE = 'P0001'; END IF;
  -- A partner's business pays its partner, so its own entitlement never makes the trial unneeded: the check on the claim decides whether its partner still has one.
  IF business_row.partner_id IS NULL AND app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'trial_not_needed' USING ERRCODE = 'P0001'; END IF;
  SELECT phone, phone_verified_at INTO user_phone, user_phone_verified_at FROM public.users WHERE id = target_user_id;
  IF user_phone IS NULL OR user_phone_verified_at IS NULL OR user_phone <> COALESCE(selection->>'verifiedPhone', '') THEN RAISE EXCEPTION 'phone_verification_required' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND (business_id = target_business_id OR user_id = target_user_id OR verified_phone = user_phone)) THEN RAISE EXCEPTION 'trial_already_used' USING ERRCODE = 'P0001'; END IF;
  IF request_ip_hash IS NOT NULL AND EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND ip_hash = request_ip_hash AND created_at >= now() - interval '30 days') THEN RAISE EXCEPTION 'trial_ip_limited' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status) VALUES(target_business_id,target_user_id,target_e164,selection,token_hash,request_key,'reserved') RETURNING id INTO new_claim_id;
  INSERT INTO public.number_trials(business_id,user_id,claim_id,verified_phone,ip_hash,status) VALUES(target_business_id,target_user_id,new_claim_id,user_phone,request_ip_hash,'reserved');
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('attribution','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
  RETURN new_claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_trial_number_claim(uuid,uuid,text,jsonb,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_trial_number_claim(uuid,uuid,text,jsonb,text,text,text) TO lobbystack_app;

-- 0147's check on every claim, which now lets a partner's trial number
-- through. 0135 refused every number for a partner's business on the cloud
-- until tiers counted them; 0147 replaced that. Every claim, from onboarding, a
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
--   trial number. A live one of a partner on Free, on the cloud while the
--   deployment bills tiers, gets its partner's one trial number instead,
--   once per partner, ever. A paid tier needs no trial, and a business that
--   isn't live, such as one whose package isn't paid (0142) or one paused
--   with its partner's other businesses (0150), gets none. Nor does a demo
--   nobody claimed yet (0149).
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
    IF NOT tier_billing AND claim_deployment_mode = 'cloud' THEN
      RAISE EXCEPTION 'partner_numbers_unavailable' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(NEW.selection_context->>'trial', '') = 'true' THEN
      -- The partner's own trial number, never the host's: a cloud business,
      -- live, of a partner on Free that hasn't had its trial. A business
      -- paused with its partner's other businesses isn't live (0150). A demo
      -- nobody claimed yet (0149) expires, so it would spend the partner's
      -- one trial on a business nobody keeps.
      IF NOT tier_billing OR claim_deployment_mode <> 'cloud' OR NOT app.has_live_entitlement(NEW.business_id)
        OR EXISTS (SELECT 1 FROM public.prospect_demos demo WHERE demo.business_id = NEW.business_id AND demo.status <> 'claimed') THEN
        RAISE EXCEPTION 'partner_numbers_unavailable' USING ERRCODE = 'P0001';
      END IF;
      IF app.partner_paid_tier(claim_partner_id) THEN
        RAISE EXCEPTION 'trial_not_needed' USING ERRCODE = 'P0001';
      END IF;
      -- A trial claim that stalled in another of the partner's businesses
      -- would hold the partner's one trial until someone retried there, so
      -- it expires here as it would in its own business: reserved for 15
      -- minutes, or provisioning for 30. That business's own claim takes
      -- its rows before the partner's lock, so rows it holds now are
      -- skipped rather than waited on, and the check below then refuses
      -- this claim until that one finishes.
      UPDATE public.onboarding_number_claim_events claim
      SET status = 'failed', completed_at = now(), last_error = CASE WHEN claim.status = 'reserved' THEN 'Number claim reservation expired.' ELSE 'Number provisioning stalled.' END, updated_at = now()
      WHERE claim.id IN (
        SELECT stale.id
        FROM public.onboarding_number_claim_events stale
        INNER JOIN public.number_trials trial ON trial.claim_id = stale.id
        WHERE trial.partner_id = claim_partner_id
          AND trial.status = 'reserved'
          AND stale.purpose = 'onboarding'
          AND ((stale.status = 'reserved' AND stale.reserved_at <= now() - interval '15 minutes') OR (stale.status = 'provisioning' AND stale.updated_at <= now() - interval '30 minutes'))
        FOR UPDATE OF stale SKIP LOCKED
      );
      UPDATE public.number_trials trial SET status = 'failed', updated_at = now()
      WHERE trial.id IN (
        SELECT reserved.id
        FROM public.number_trials reserved
        INNER JOIN public.onboarding_number_claim_events claim ON claim.id = reserved.claim_id
        WHERE reserved.partner_id = claim_partner_id
          AND reserved.status = 'reserved'
          AND claim.status = 'failed'
        FOR UPDATE OF reserved SKIP LOCKED
      );
      IF app.partner_number_trial_used(claim_partner_id)
        OR EXISTS (SELECT 1 FROM public.number_trials trial WHERE trial.partner_id = claim_partner_id AND trial.status <> 'failed') THEN
        RAISE EXCEPTION 'partner_trial_used' USING ERRCODE = 'P0001';
      END IF;
    ELSIF tier_billing
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
