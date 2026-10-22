-- An API claim, which ignores the onboarding stage order, moved a business on
-- any step before attribution to phone_number_claiming. A failed or abandoned
-- claim then sent it to phone_number, so a partner's business still on its
-- website or knowledge step skipped them. Now only a business already on the
-- number step moves to phone_number_claiming, and the domain moves only
-- phone_number_claiming back. Everything else is as 0116 defined it.
CREATE OR REPLACE FUNCTION app.reserve_api_number_claim(target_business_id uuid, target_user_id uuid, claim_purpose text, replacing_number_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text, request_ip_hash text, quota_by_business boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE new_claim_id uuid; claim_reserved_at timestamptz; old_number_e164 text; business_row public.businesses%ROWTYPE; account_plan text; account_state text; is_paid boolean; is_trial boolean; user_phone text; user_phone_verified_at timestamptz;
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's
  -- settings. Only lobbystack_worker, which serves /api/v1, may execute this.
  IF NULLIF(current_setting('app.actor_type', true), '') IS DISTINCT FROM 'worker'
    OR target_business_id IS DISTINCT FROM NULLIF(current_setting('app.business_id', true), '')::uuid
    OR target_user_id IS NULL
    OR quota_by_business IS NULL
    OR COALESCE(claim_purpose, '') NOT IN ('onboarding', 'replacement')
    OR (claim_purpose = 'replacement') <> (replacing_number_id IS NOT NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  is_trial := claim_purpose = 'onboarding' AND COALESCE(selection->>'trial', '') = 'true';
  PERFORM pg_advisory_xact_lock(hashtextextended('phone-claim:' || target_business_id::text, 0));
  -- As in reserve_trial_number_claim: the checks below read other businesses' trials, so trial claims take turns.
  IF is_trial THEN PERFORM pg_advisory_xact_lock(hashtextextended('number-trial-claims', 0)); END IF;
  SELECT id INTO new_claim_id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND idempotency_key = request_key;
  IF new_claim_id IS NOT NULL THEN RETURN new_claim_id; END IF;
  SELECT * INTO business_row FROM public.businesses WHERE id = target_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT plan, subscription_state INTO account_plan, account_state FROM public.billing_accounts WHERE business_id = target_business_id;
  is_paid := COALESCE(account_plan, '') IN ('starter','pro','enterprise') AND COALESCE(account_state, '') IN ('active','trialing','past_due');

  IF claim_purpose = 'onboarding' THEN
    UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = CASE WHEN status = 'reserved' THEN 'Number claim reservation expired.' ELSE 'Number provisioning stalled.' END, updated_at = now()
      WHERE business_id = target_business_id AND purpose = 'onboarding'
        AND ((status = 'reserved' AND reserved_at <= now() - interval '15 minutes') OR (status = 'provisioning' AND updated_at <= now() - interval '30 minutes'));
    UPDATE public.number_trials SET status = 'failed', updated_at = now()
      WHERE business_id = target_business_id AND status = 'reserved'
        AND claim_id IN (SELECT id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND status = 'failed');
    IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose = 'onboarding' AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'number_claim_in_progress' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.phone_numbers WHERE business_id = target_business_id AND status IN ('active','provisioning')) THEN RAISE EXCEPTION 'business_number_exists' USING ERRCODE = 'P0001'; END IF;
    IF is_trial THEN
      IF business_row.deployment_mode <> 'cloud' THEN RAISE EXCEPTION 'trial_not_available' USING ERRCODE = 'P0001'; END IF;
      IF is_paid THEN RAISE EXCEPTION 'trial_not_needed' USING ERRCODE = 'P0001'; END IF;
      SELECT phone, phone_verified_at INTO user_phone, user_phone_verified_at FROM public.users WHERE id = target_user_id;
      IF user_phone IS NULL OR user_phone_verified_at IS NULL OR user_phone <> COALESCE(selection->>'verifiedPhone', '') THEN RAISE EXCEPTION 'phone_verification_required' USING ERRCODE = 'P0001'; END IF;
      IF EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND (business_id = target_business_id OR user_id = target_user_id OR verified_phone = user_phone)) THEN RAISE EXCEPTION 'trial_already_used' USING ERRCODE = 'P0001'; END IF;
      IF request_ip_hash IS NOT NULL AND EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND ip_hash = request_ip_hash AND created_at >= now() - interval '30 days') THEN RAISE EXCEPTION 'trial_ip_limited' USING ERRCODE = 'P0001'; END IF;
    ELSIF business_row.deployment_mode = 'cloud' AND NOT is_paid THEN
      RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = 'Number replacement reservation expired.', updated_at = now()
      WHERE business_id = target_business_id AND purpose = 'replacement' AND status = 'reserved' AND reserved_at <= now() - interval '15 minutes';
    IF business_row.phone_number_replacement_used_at IS NOT NULL THEN RAISE EXCEPTION 'replacement_already_used' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose = 'replacement' AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'replacement_already_reserved' USING ERRCODE = 'P0001'; END IF;
    SELECT e164 INTO old_number_e164 FROM public.phone_numbers WHERE id = replacing_number_id AND business_id = target_business_id AND status = 'active' AND reclaim_scheduled_at IS NULL;
    IF old_number_e164 IS NULL THEN RAISE EXCEPTION 'active_number_required' USING ERRCODE = 'P0001'; END IF;
    IF old_number_e164 = target_e164 THEN RAISE EXCEPTION 'replacement_number_must_differ' USING ERRCODE = 'P0001'; END IF;
    IF business_row.deployment_mode = 'cloud' AND NOT is_paid THEN RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE (CASE WHEN quota_by_business THEN business_id = target_business_id ELSE user_id = target_user_id END) AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  -- A trial is once per person and phone already, so only bought numbers count toward the daily and 30-day limits.
  IF NOT is_trial THEN
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE (CASE WHEN quota_by_business THEN business_id = target_business_id ELSE user_id = target_user_id END) AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE (CASE WHEN quota_by_business THEN business_id = target_business_id ELSE user_id = target_user_id END) AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  END IF;

  INSERT INTO public.onboarding_number_claim_events(business_id, user_id, purpose, replacing_phone_number_id, requested_e164, selection_context, claim_token_hash, idempotency_key, status)
    VALUES (target_business_id, target_user_id, claim_purpose, replacing_number_id, target_e164, selection, token_hash, request_key, 'reserved')
    RETURNING id, reserved_at INTO new_claim_id, claim_reserved_at;
  IF claim_purpose = 'onboarding' THEN
    IF is_trial THEN
      INSERT INTO public.number_trials(business_id, user_id, claim_id, verified_phone, ip_hash, status) VALUES (target_business_id, target_user_id, new_claim_id, user_phone, request_ip_hash, 'reserved');
    END IF;
    -- Only a business on the number step moves to claiming one, so a failed or abandoned claim, which
    -- moves claiming back to phone_number, leaves a business on an earlier step where it was.
    UPDATE public.businesses SET onboarding_stage = 'phone_number_claiming', updated_at = now() WHERE id = target_business_id AND onboarding_stage = 'phone_number';
  ELSE
    UPDATE public.businesses SET phone_number_replacement_reserved_at = claim_reserved_at, updated_at = now() WHERE id = target_business_id;
  END IF;
  RETURN new_claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_api_number_claim(uuid, uuid, text, uuid, text, jsonb, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_api_number_claim(uuid, uuid, text, uuid, text, jsonb, text, text, text, boolean) TO lobbystack_worker;
