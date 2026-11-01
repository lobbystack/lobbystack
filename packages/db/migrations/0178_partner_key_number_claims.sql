-- A partner's platform key can buy and replace numbers for the partner's
-- businesses, so a partner that runs its own product on the v1 API needs no
-- person to sign in. A key acts as the partner, which has no account, so a
-- claim now names the person who made it or the key.
--
-- Only a paid tier pays for what a key buys, so a key's claim needs one wherever
-- the deployment bills tiers, for a replacement too. Without tier billing, the
-- cloud refuses it and a self-hosted server allows it, as for a new number
-- (0147). The check on the claim (0154) still counts the tier's numbers and the
-- partner's quotas, whoever claims.
--
-- A key never claims a trial number, which runs on one person's verified mobile.

-- The key that made the claim. It stays after the key is deleted, as an
-- invitation's does (0139), so the claim keeps saying who made it.
ALTER TABLE public.onboarding_number_claim_events ADD COLUMN IF NOT EXISTS platform_key_id uuid;
ALTER TABLE public.onboarding_number_claim_events ALTER COLUMN user_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.onboarding_number_claim_events'::regclass AND conname = 'onboarding_number_claim_events_claimant_check') THEN
    ALTER TABLE public.onboarding_number_claim_events ADD CONSTRAINT onboarding_number_claim_events_claimant_check CHECK (user_id IS NOT NULL OR platform_key_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

-- The v1 API's claim for a partner's platform key: app.reserve_api_number_claim
-- (0159) with the key in place of a person, and no trial. The per-business
-- limits are the ones that function applies to a platform key. Only
-- lobbystack_worker, which serves /api/v1, may execute this.
CREATE OR REPLACE FUNCTION app.reserve_partner_key_number_claim(target_business_id uuid, target_platform_key_id uuid, claim_purpose text, replacing_number_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE new_claim_id uuid; claim_reserved_at timestamptz; old_number_e164 text; business_row public.businesses%ROWTYPE; tier_billing boolean;
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's settings.
  IF NULLIF(current_setting('app.actor_type', true), '') IS DISTINCT FROM 'worker'
    OR target_business_id IS DISTINCT FROM NULLIF(current_setting('app.business_id', true), '')::uuid
    OR target_platform_key_id IS NULL
    OR COALESCE(claim_purpose, '') NOT IN ('onboarding', 'replacement')
    OR (claim_purpose = 'replacement') <> (replacing_number_id IS NOT NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(selection->>'trial', '') = 'true' THEN RAISE EXCEPTION 'trial_not_available' USING ERRCODE = 'P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('phone-claim:' || target_business_id::text, 0));
  SELECT id INTO new_claim_id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND idempotency_key = request_key;
  IF new_claim_id IS NOT NULL THEN RETURN new_claim_id; END IF;
  SELECT * INTO business_row FROM public.businesses WHERE id = target_business_id;
  IF NOT FOUND OR business_row.partner_id IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  -- A share lock, so revoking the key waits for this claim, as it does for everything else a key leaves behind.
  PERFORM 1 FROM public.partner_platform_keys key WHERE key.id = target_platform_key_id AND key.partner_id = business_row.partner_id AND key.revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  tier_billing := app.partner_tier_billing();
  IF NOT tier_billing AND business_row.deployment_mode = 'cloud' THEN RAISE EXCEPTION 'partner_numbers_unavailable' USING ERRCODE = 'P0001'; END IF;
  IF tier_billing AND NOT app.partner_paid_tier(business_row.partner_id) THEN RAISE EXCEPTION 'partner_number_limit_reached' USING ERRCODE = 'P0001'; END IF;
  -- A business that isn't live, such as one whose package isn't paid (0142) or one paused with its partner's others (0150), gets no number.
  IF business_row.deployment_mode = 'cloud' AND NOT app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'partner_numbers_unavailable' USING ERRCODE = 'P0001'; END IF;

  IF claim_purpose = 'onboarding' THEN
    UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = CASE WHEN status = 'reserved' THEN 'Number claim reservation expired.' ELSE 'Number provisioning stalled.' END, updated_at = now()
      WHERE business_id = target_business_id AND purpose = 'onboarding'
        AND ((status = 'reserved' AND reserved_at <= now() - interval '15 minutes') OR (status = 'provisioning' AND updated_at <= now() - interval '30 minutes'));
    UPDATE public.number_trials SET status = 'failed', updated_at = now()
      WHERE business_id = target_business_id AND status = 'reserved'
        AND claim_id IN (SELECT id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND status = 'failed');
    IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose = 'onboarding' AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'number_claim_in_progress' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.phone_numbers WHERE business_id = target_business_id AND status IN ('active','provisioning')) THEN RAISE EXCEPTION 'business_number_exists' USING ERRCODE = 'P0001'; END IF;
  ELSE
    UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = 'Number replacement reservation expired.', updated_at = now()
      WHERE business_id = target_business_id AND purpose = 'replacement' AND status = 'reserved' AND reserved_at <= now() - interval '15 minutes';
    IF business_row.phone_number_replacement_used_at IS NOT NULL THEN RAISE EXCEPTION 'replacement_already_used' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose = 'replacement' AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'replacement_already_reserved' USING ERRCODE = 'P0001'; END IF;
    SELECT e164 INTO old_number_e164 FROM public.phone_numbers WHERE id = replacing_number_id AND business_id = target_business_id AND status = 'active' AND reclaim_scheduled_at IS NULL;
    IF old_number_e164 IS NULL THEN RAISE EXCEPTION 'active_number_required' USING ERRCODE = 'P0001'; END IF;
    IF old_number_e164 = target_e164 THEN RAISE EXCEPTION 'replacement_number_must_differ' USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.onboarding_number_claim_events(business_id, platform_key_id, purpose, replacing_phone_number_id, requested_e164, selection_context, claim_token_hash, idempotency_key, status)
    VALUES (target_business_id, target_platform_key_id, claim_purpose, replacing_number_id, target_e164, selection, token_hash, request_key, 'reserved')
    RETURNING id, reserved_at INTO new_claim_id, claim_reserved_at;
  IF claim_purpose = 'onboarding' THEN
    -- As in reserve_api_number_claim, only a business on the number step moves to claiming one.
    UPDATE public.businesses SET onboarding_stage = 'phone_number_claiming', updated_at = now() WHERE id = target_business_id AND onboarding_stage = 'phone_number';
  ELSE
    UPDATE public.businesses SET phone_number_replacement_reserved_at = claim_reserved_at, updated_at = now() WHERE id = target_business_id;
  END IF;
  RETURN new_claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_partner_key_number_claim(uuid, uuid, text, uuid, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_partner_key_number_claim(uuid, uuid, text, uuid, text, jsonb, text, text) TO lobbystack_worker;
