-- A business can belong to a partner, which resells LobbyStack under its own
-- brand. The partners table comes later, so the column has no foreign key yet.
-- Every existing business has no partner and stays direct, and a direct
-- business never moves under a partner.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS partner_id uuid;

-- Both runtime roles may update businesses, so the database keeps a direct
-- business direct: a partner's business gets its partner when it's created,
-- and an update can't give one to a business that has none. The cap below
-- relies on this.
CREATE OR REPLACE FUNCTION app.keep_direct_business_direct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'direct_business_cannot_join_partner' USING ERRCODE = '42501';
END
$$;
REVOKE ALL ON FUNCTION app.keep_direct_business_direct() FROM PUBLIC;

DROP TRIGGER IF EXISTS businesses_keep_direct_before_update ON public.businesses;
CREATE TRIGGER businesses_keep_direct_before_update
BEFORE UPDATE OF partner_id ON public.businesses
FOR EACH ROW
WHEN (OLD.partner_id IS NULL AND NEW.partner_id IS NOT NULL)
EXECUTE FUNCTION app.keep_direct_business_direct();

-- The cap of 10 businesses one account can own counts only direct businesses,
-- since a partner's businesses count against its tier. createBusiness runs
-- scoped to the new business, where row-level security hides the account's
-- other businesses, so this counts the owned businesses that
-- app.list_user_businesses lists and that have no partner. Like that list, it
-- counts only for the account the transaction acts as.
CREATE OR REPLACE FUNCTION app.count_owned_direct_businesses(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  SELECT count(*)::integer
  FROM app.list_user_businesses(p_user_id) owned
  INNER JOIN public.businesses business ON business.id = owned.business_id
  WHERE owned.role = 'business_owner'
    AND business.partner_id IS NULL
$$;
REVOKE ALL ON FUNCTION app.count_owned_direct_businesses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.count_owned_direct_businesses(uuid) TO lobbystack_app;

-- Whether a business holds a live entitlement, by the rule hasLiveEntitlement
-- in packages/shared applies: a plan the plan catalog marks paid (Starter, Pro
-- or Enterprise) on a live subscription, past_due included. A missing account
-- or plan isn't live. The number-claim functions below call this instead of
-- each repeating the check. They run as its owner, so no runtime role needs to.
CREATE OR REPLACE FUNCTION app.has_live_entitlement(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT account.plan IN ('starter', 'pro', 'enterprise') AND account.subscription_state IN ('active', 'trialing', 'past_due')
    FROM public.billing_accounts account
    WHERE account.business_id = target_business_id
  ), false)
$$;
REVOKE ALL ON FUNCTION app.has_live_entitlement(uuid) FROM PUBLIC;

-- The number claims ask app.has_live_entitlement. Everything else is as 0084
-- (onboarding), 0026 (replacement), 0101 (trial) and 0121 (API) defined it,
-- refusals and their order included. 0084 and 0026 let an account with a live
-- state but no plan through, which the dashboard's own check already refused.

CREATE OR REPLACE FUNCTION app.reserve_onboarding_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE claim_id uuid; business_row public.businesses%ROWTYPE;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
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
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status) VALUES(target_business_id,target_user_id,target_e164,selection,token_hash,request_key,'reserved') ON CONFLICT (business_id,idempotency_key) DO UPDATE SET updated_at = onboarding_number_claim_events.updated_at RETURNING id INTO claim_id;
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('attribution','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
  RETURN claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_onboarding_number_claim(uuid,uuid,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_onboarding_number_claim(uuid,uuid,text,jsonb,text,text) TO lobbystack_app;

CREATE OR REPLACE FUNCTION app.reserve_replacement_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE claim_id uuid; claim_reserved_at timestamptz; old_number_id uuid; old_number_e164 text; business_row public.businesses%ROWTYPE;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
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
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,purpose,replacing_phone_number_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status) VALUES(target_business_id,target_user_id,'replacement',old_number_id,target_e164,selection,token_hash,request_key,'reserved') RETURNING id, reserved_at INTO claim_id, claim_reserved_at;
  UPDATE public.businesses SET phone_number_replacement_reserved_at = claim_reserved_at, updated_at = now() WHERE id = target_business_id;
  RETURN claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_replacement_number_claim(uuid,uuid,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_replacement_number_claim(uuid,uuid,text,jsonb,text,text) TO lobbystack_app;

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
  IF app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'trial_not_needed' USING ERRCODE = 'P0001'; END IF;
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
