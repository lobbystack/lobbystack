-- A partner member works in the partner's businesses through an open, not
-- their teams (0136), and claims numbers there as the business's own team
-- does. Two things change for them:
-- - A partner member can claim the partner's one trial number (0154) after
--   verifying their own mobile in the business, as its owner can. The trial's
--   calls then transfer only to that mobile, which number_trials records as
--   the claimer's verified phone, whoever claims.
-- - Their claims count against the partner's quotas only: each business's 3
--   claims an hour, and the partner's daily and 30-day quotas, which
--   app.check_partner_number_claim (0154) applies to every claim of a
--   partner's business. The per-user cap of the claim functions (3 claims an
--   hour, 2 numbers bought a day and 5 in 30 days) skips them, and no longer
--   counts the claims a person made as a partner member. Direct businesses
--   and a business's own team keep it.

-- Whether a partner member made the claim through an open of the business,
-- rather than someone on its team. The claim functions below set it.
ALTER TABLE public.onboarding_number_claim_events ADD COLUMN IF NOT EXISTS by_partner_member boolean NOT NULL DEFAULT false;

-- Verifying a phone sets the person's own phone. A partner member now
-- verifies theirs in a business they opened, to claim its partner's trial
-- number. The application lets them only while the business is offered that
-- trial, through the phone step's carrier lookup and code. SMS alerts still
-- go only to the business's own team (0075), and the application keeps their
-- verification to the team. Everything else is as 0136 defined it.
CREATE OR REPLACE FUNCTION app.reserve_phone_verification_attempt(target_business_id uuid, target_user_id uuid, target_phone text, target_country text, target_line_type text, fingerprint text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE attempt_id uuid;
BEGIN
  IF session_user <> 'lobbystack_app' OR NULLIF(current_setting('app.actor_type', true), '') <> 'operator' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.onboarding_phone_verifications WHERE user_id = target_user_id AND started_at >= now() - interval '1 hour') >= 5 THEN RAISE EXCEPTION 'verification_user_rate_limited' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_phone_verifications WHERE phone_e164 = target_phone AND started_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'verification_phone_rate_limited' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.onboarding_phone_verifications WHERE user_id = target_user_id AND phone_e164 = target_phone AND started_at >= now() - interval '30 seconds') THEN RAISE EXCEPTION 'verification_cooldown' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_phone_verifications(business_id,user_id,phone_e164,country_code,line_type,status,expires_at,request_fingerprint) VALUES(target_business_id,target_user_id,target_phone,target_country,target_line_type,'queued',now() + interval '10 minutes',fingerprint) RETURNING id INTO attempt_id;
  RETURN attempt_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_phone_verification_attempt(uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_phone_verification_attempt(uuid,uuid,text,text,text,text) TO lobbystack_app;

-- The same for finishing a verification. Onboarding is the owner's, and a
-- partner's business forwards calls to its owner's verified phone, so only
-- the business's own team moves its onboarding on (0134). Everything else is
-- as 0136 defined it.
CREATE OR REPLACE FUNCTION app.complete_phone_verification(target_business_id uuid, target_user_id uuid, target_attempt_id uuid, provider_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.onboarding_phone_verifications SET status = 'approved', approved_at = now(), updated_at = now(), last_error = NULL WHERE id = target_attempt_id AND business_id = target_business_id AND user_id = target_user_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.users SET phone = (SELECT phone_e164 FROM public.onboarding_phone_verifications WHERE id = target_attempt_id), phone_verified_at = now(), updated_at = now() WHERE id = target_user_id;
  IF app.has_team_membership(target_business_id) THEN
    UPDATE public.businesses SET onboarding_stage = CASE WHEN partner_id IS NULL THEN 'phone_number' ELSE 'complete' END, updated_at = now() WHERE id = target_business_id AND onboarding_stage = 'verify_phone';
  END IF;
  RETURN provider_status = 'approved';
END $$;
REVOKE ALL ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) TO lobbystack_app;

-- The dashboard's claims. has_business_membership lets a partner open in,
-- and someone not on the team got in through one, so the per-user cap skips
-- their claim and marks it as a partner member's. Everything else is as 0127
-- (onboarding and replacement) and 0154 (trial) defined it.

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
  IF business_row.onboarding_stage NOT IN ('plan','phone_number','attribution','complete') THEN RAISE EXCEPTION 'invalid_onboarding_stage' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.phone_numbers WHERE business_id = target_business_id AND status IN ('active','provisioning')) THEN RAISE EXCEPTION 'business_number_exists' USING ERRCODE = 'P0001'; END IF;
  IF business_row.deployment_mode = 'cloud' AND NOT app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001'; END IF;
  IF NOT partner_member_claim THEN
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status,by_partner_member) VALUES(target_business_id,target_user_id,target_e164,selection,token_hash,request_key,'reserved',partner_member_claim) ON CONFLICT (business_id,idempotency_key) DO UPDATE SET updated_at = onboarding_number_claim_events.updated_at RETURNING id INTO claim_id;
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('attribution','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
  RETURN claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_onboarding_number_claim(uuid,uuid,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_onboarding_number_claim(uuid,uuid,text,jsonb,text,text) TO lobbystack_app;

CREATE OR REPLACE FUNCTION app.reserve_replacement_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE claim_id uuid; claim_reserved_at timestamptz; old_number_id uuid; old_number_e164 text; business_row public.businesses%ROWTYPE; partner_member_claim boolean;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  partner_member_claim := NOT app.has_team_membership(target_business_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('phone-claim:' || target_business_id::text, 0));
  SELECT id INTO claim_id FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND idempotency_key = request_key;
  IF claim_id IS NOT NULL THEN RETURN claim_id; END IF;
  UPDATE public.onboarding_number_claim_events SET status = 'failed', completed_at = now(), last_error = 'Number replacement reservation expired.', updated_at = now()
    WHERE business_id = target_business_id AND purpose = 'replacement' AND status = 'reserved' AND reserved_at <= now() - interval '15 minutes';
  SELECT * INTO business_row FROM public.businesses WHERE id = target_business_id;
  IF business_row.phone_number_replacement_used_at IS NOT NULL THEN RAISE EXCEPTION 'replacement_already_used' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.onboarding_number_claim_events WHERE business_id = target_business_id AND purpose = 'replacement' AND status IN ('reserved','provisioning')) THEN RAISE EXCEPTION 'replacement_already_reserved' USING ERRCODE = 'P0001'; END IF;
  SELECT id, e164 INTO old_number_id, old_number_e164 FROM public.phone_numbers WHERE business_id = target_business_id AND status = 'active' AND reclaim_scheduled_at IS NULL ORDER BY created_at DESC LIMIT 1;
  IF old_number_id IS NULL THEN RAISE EXCEPTION 'active_number_required' USING ERRCODE = 'P0001'; END IF;
  IF old_number_e164 = target_e164 THEN RAISE EXCEPTION 'replacement_number_must_differ' USING ERRCODE = 'P0001'; END IF;
  IF business_row.deployment_mode = 'cloud' AND NOT app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001'; END IF;
  IF NOT partner_member_claim THEN
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,purpose,replacing_phone_number_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status,by_partner_member) VALUES(target_business_id,target_user_id,'replacement',old_number_id,target_e164,selection,token_hash,request_key,'reserved',partner_member_claim) RETURNING id, reserved_at INTO claim_id, claim_reserved_at;
  UPDATE public.businesses SET phone_number_replacement_reserved_at = claim_reserved_at, updated_at = now() WHERE id = target_business_id;
  RETURN claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_replacement_number_claim(uuid,uuid,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_replacement_number_claim(uuid,uuid,text,jsonb,text,text) TO lobbystack_app;

-- The trial claim keeps the host's trial rules for everyone who claims: the
-- claimer's own verified mobile, and once per person, phone and network.
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
  IF business_row.onboarding_stage NOT IN ('phone_number','attribution','complete') THEN RAISE EXCEPTION 'invalid_onboarding_stage' USING ERRCODE = 'P0001'; END IF;
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
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('attribution','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
  RETURN new_claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_trial_number_claim(uuid,uuid,text,jsonb,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_trial_number_claim(uuid,uuid,text,jsonb,text,text,text) TO lobbystack_app;

-- The v1 API's claim, whose per-user cap (an API key acts for its creator)
-- no longer counts the claims a person made as a partner member. A
-- platform key's cap counts the business's claims, as before. Everything
-- else is as 0127 defined it.
CREATE OR REPLACE FUNCTION app.reserve_api_number_claim(target_business_id uuid, target_user_id uuid, claim_purpose text, replacing_number_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text, request_ip_hash text, quota_by_business boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE new_claim_id uuid; claim_reserved_at timestamptz; old_number_e164 text; business_row public.businesses%ROWTYPE; is_paid boolean; is_trial boolean; user_phone text; user_phone_verified_at timestamptz;
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
  is_paid := app.has_live_entitlement(target_business_id);

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

  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE (CASE WHEN quota_by_business THEN business_id = target_business_id ELSE user_id = target_user_id AND NOT by_partner_member END) AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  -- A trial is once per person and phone already, so only bought numbers count toward the daily and 30-day limits.
  IF NOT is_trial THEN
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE (CASE WHEN quota_by_business THEN business_id = target_business_id ELSE user_id = target_user_id AND NOT by_partner_member END) AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE (CASE WHEN quota_by_business THEN business_id = target_business_id ELSE user_id = target_user_id AND NOT by_partner_member END) AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
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
