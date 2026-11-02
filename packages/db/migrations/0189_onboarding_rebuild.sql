-- The onboarding rebuild: Documents, the greeting and the test call left, a
-- language question joined the no-website path, and Meet your agent is the last
-- screen. The previous admin and worker keep running after this migration, so
-- nothing here writes the new stages, and every stage they know stays valid.

SET LOCAL lock_timeout = '5s';

-- True for every row that exists today and every insert from old code, so
-- detection only runs for businesses new code marks as a guess.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS default_locale_chosen boolean NOT NULL DEFAULT true,
  -- Test chats write nothing else, so this is the only record of one.
  ADD COLUMN IF NOT EXISTS last_test_chat_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_offer_shown_at timestamptz;

-- Owners on a removed step move to the next one that exists. Old code treats
-- verify_phone as past all of them, so a page it has open still finishes.
UPDATE public.businesses
  SET onboarding_stage = 'verify_phone', updated_at = now()
  WHERE onboarding_stage IN ('plan', 'verify_phone_code', 'knowledge', 'greeting', 'test_call');

-- A number can be claimed from Meet your agent, and a claim leaves the stage
-- where it is. Only the stage lists differ from 0181.
CREATE OR REPLACE FUNCTION app.reserve_onboarding_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE claim_id uuid; business_row public.businesses%ROWTYPE; partner_member_claim boolean;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  partner_member_claim := NOT app.has_team_membership(target_business_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('phone-claim:' || target_business_id::text, 0));
  SELECT id INTO claim_id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND idempotency_key = request_key;
  IF claim_id IS NOT NULL THEN RETURN claim_id; END IF;
  UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = CASE WHEN status = 'reserved' THEN 'Number claim reservation expired.' ELSE 'Number provisioning stalled.' END, updated_at = now()
    WHERE business_id = target_business_id AND purpose = 'onboarding'
      AND ((status = 'reserved' AND reserved_at <= now() - interval '15 minutes') OR (status = 'provisioning' AND updated_at <= now() - interval '30 minutes'));
  IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose = 'onboarding' AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'number_claim_in_progress' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO business_row FROM public.businesses WHERE id = target_business_id;
  IF business_row.onboarding_stage NOT IN ('plan','phone_number','goal','attribution','meet','complete') THEN RAISE EXCEPTION 'invalid_onboarding_stage' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.phone_numbers WHERE business_id = target_business_id AND status IN ('active','provisioning')) THEN RAISE EXCEPTION 'business_number_exists' USING ERRCODE = 'P0001'; END IF;
  IF business_row.deployment_mode = 'cloud' AND NOT app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001'; END IF;
  IF NOT partner_member_claim THEN
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status,by_partner_member) VALUES(target_business_id,target_user_id,target_e164,selection,token_hash,request_key,'reserved',partner_member_claim) ON CONFLICT (business_id,idempotency_key) DO UPDATE SET updated_at = onboarding_number_claim_events.updated_at RETURNING id INTO claim_id;
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('goal','attribution','meet','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
  RETURN claim_id;
END $$;

CREATE OR REPLACE FUNCTION app.reserve_trial_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text, request_ip_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE new_claim_id uuid; business_row public.businesses%ROWTYPE; user_phone text; user_phone_verified_at timestamptz; partner_member_claim boolean;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  partner_member_claim := NOT app.has_team_membership(target_business_id);
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
  SELECT phone, phone_verified_at INTO user_phone, user_phone_verified_at FROM public.users WHERE id = target_user_id;
  IF user_phone IS NULL OR user_phone_verified_at IS NULL OR user_phone <> COALESCE(selection->>'verifiedPhone', '') THEN RAISE EXCEPTION 'phone_verification_required' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND (business_id = target_business_id OR user_id = target_user_id OR verified_phone = user_phone)) THEN RAISE EXCEPTION 'trial_already_used' USING ERRCODE = 'P0001'; END IF;
  IF request_ip_hash IS NOT NULL AND EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND ip_hash = request_ip_hash AND created_at >= now() - interval '30 days') THEN RAISE EXCEPTION 'trial_ip_limited' USING ERRCODE = 'P0001'; END IF;
  IF NOT partner_member_claim AND (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status,by_partner_member) VALUES(target_business_id,target_user_id,target_e164,selection,token_hash,request_key,'reserved',partner_member_claim) RETURNING id INTO new_claim_id;
  INSERT INTO public.number_trials(business_id,user_id,claim_id,verified_phone,ip_hash,status) VALUES(target_business_id,target_user_id,new_claim_id,user_phone,request_ip_hash,'reserved');
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('goal','attribution','meet','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
  RETURN new_claim_id;
END $$;

-- Finishing a verification. A partner's business now goes on to Meet your
-- agent unless its partner sets it up, and a stage old code wrote during the
-- release counts as the phone step. This has its own name because
-- app.complete_phone_verification must keep ending at complete: the previous
-- admin can't read meet. Remove that one with the next release. Everything
-- else is as 0159 defined it.
CREATE OR REPLACE FUNCTION app.finish_phone_verification(target_business_id uuid, target_user_id uuid, target_attempt_id uuid, provider_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.onboarding_phone_verifications SET status = 'approved', approved_at = now(), updated_at = now(), last_error = NULL WHERE id = target_attempt_id AND business_id = target_business_id AND user_id = target_user_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.users SET phone = (SELECT phone_e164 FROM public.onboarding_phone_verifications WHERE id = target_attempt_id), phone_verified_at = now(), updated_at = now() WHERE id = target_user_id;
  IF app.has_team_membership(target_business_id) THEN
    UPDATE public.businesses SET onboarding_stage = CASE WHEN partner_id IS NULL THEN 'phone_number' WHEN partner_access_level = 'activity' THEN 'complete' ELSE 'meet' END, updated_at = now()
      WHERE id = target_business_id AND onboarding_stage IN ('verify_phone', 'plan', 'verify_phone_code', 'knowledge', 'greeting', 'test_call');
  END IF;
  RETURN provider_status = 'approved';
END $$;
REVOKE ALL ON FUNCTION app.finish_phone_verification(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.finish_phone_verification(uuid,uuid,uuid,text) TO lobbystack_app;
