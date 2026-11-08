-- A free trial number no longer needs a verified mobile by default. The
-- account's verified email, a clean network and the quotas decide, and the
-- dashboard asks for the mobile only when the network can't identify the
-- caller or already started a trial in the last 30 days. A trial started that
-- way records no phone: number_trials.verified_phone becomes nullable.
ALTER TABLE public.number_trials ALTER COLUMN verified_phone DROP NOT NULL;

-- The trial's pre-check reads the account's verified email the way the claim
-- does, from the dashboard (app) and from the API (worker). Both could already
-- read users' email; this adds the flag.
GRANT SELECT (email_verified) ON public.users TO lobbystack_app, lobbystack_worker;

-- Reserves a trial number, with or without the claimer's verified mobile.
-- `selection->>'withoutSms' = 'true'` marks an offer the dashboard signed
-- after checking the email and network signals itself; the claim still
-- requires a verified email, counts the business, user, verified phone and
-- network once each, and keeps the plan and stage rules. Without that mark,
-- the mobile is required and must be the one in the offer, as before.
CREATE OR REPLACE FUNCTION app.reserve_trial_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text, request_ip_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE new_claim_id uuid; business_row public.businesses%ROWTYPE; user_phone text; user_phone_verified_at timestamptz; user_email_verified boolean; without_sms boolean; partner_member_claim boolean;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  partner_member_claim := NOT app.has_team_membership(target_business_id);
  without_sms := COALESCE(selection->>'withoutSms', '') = 'true';
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
  IF business_row.onboarding_stage NOT IN ('phone_number','goal','attribution','meet','complete') THEN RAISE EXCEPTION 'invalid_onboarding_stage' USING ERRCODE = 'P0001'; END IF;
  IF business_row.deployment_mode <> 'cloud' THEN RAISE EXCEPTION 'trial_not_available' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.phone_numbers WHERE business_id = target_business_id AND status IN ('active','provisioning')) THEN RAISE EXCEPTION 'business_number_exists' USING ERRCODE = 'P0001'; END IF;
  -- A partner's business pays its partner, so its own entitlement never makes the trial unneeded: the check on the claim decides whether its partner still has one.
  IF business_row.partner_id IS NULL AND app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'trial_not_needed' USING ERRCODE = 'P0001'; END IF;
  SELECT phone, phone_verified_at, email_verified INTO user_phone, user_phone_verified_at, user_email_verified FROM public.users WHERE id = target_user_id;
  IF user_email_verified IS NOT TRUE THEN RAISE EXCEPTION 'email_verification_required' USING ERRCODE = 'P0001'; END IF;
  IF without_sms THEN
    -- The dashboard checked the email and network. A phone the claimer has
    -- verified elsewhere is still recorded, so it can't carry a second trial.
    IF request_ip_hash IS NULL THEN RAISE EXCEPTION 'phone_verification_required' USING ERRCODE = 'P0001'; END IF;
    IF user_phone_verified_at IS NULL THEN user_phone := NULL; END IF;
  ELSIF user_phone IS NULL OR user_phone_verified_at IS NULL OR user_phone <> COALESCE(selection->>'verifiedPhone', '') THEN
    RAISE EXCEPTION 'phone_verification_required' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND (business_id = target_business_id OR user_id = target_user_id OR (user_phone IS NOT NULL AND verified_phone = user_phone))) THEN RAISE EXCEPTION 'trial_already_used' USING ERRCODE = 'P0001'; END IF;
  IF request_ip_hash IS NOT NULL AND EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND ip_hash = request_ip_hash AND created_at >= now() - interval '30 days') THEN RAISE EXCEPTION 'trial_ip_limited' USING ERRCODE = 'P0001'; END IF;
  IF NOT partner_member_claim AND (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status,by_partner_member) VALUES(target_business_id,target_user_id,target_e164,selection,token_hash,request_key,'reserved',partner_member_claim) RETURNING id INTO new_claim_id;
  INSERT INTO public.number_trials(business_id,user_id,claim_id,verified_phone,ip_hash,status) VALUES(target_business_id,target_user_id,new_claim_id,user_phone,request_ip_hash,'reserved');
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('goal','attribution','meet','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
  RETURN new_claim_id;
END $$;
