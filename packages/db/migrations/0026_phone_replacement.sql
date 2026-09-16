ALTER TABLE public.onboarding_number_claim_events ADD COLUMN IF NOT EXISTS purpose varchar(32) NOT NULL DEFAULT 'onboarding';
ALTER TABLE public.onboarding_number_claim_events ADD COLUMN IF NOT EXISTS replacing_phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION app.reserve_replacement_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE claim_id uuid; claim_reserved_at timestamptz; old_number_id uuid; old_number_e164 text; business_row public.businesses%ROWTYPE; account_plan text; account_state text;
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
  SELECT plan, subscription_state INTO account_plan, account_state FROM public.billing_accounts WHERE business_id = target_business_id;
  IF business_row.deployment_mode = 'cloud' AND (account_plan NOT IN ('starter','pro','enterprise') OR COALESCE(account_state,'') NOT IN ('active','trialing','past_due')) THEN RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,purpose,replacing_phone_number_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status) VALUES(target_business_id,target_user_id,'replacement',old_number_id,target_e164,selection,token_hash,request_key,'reserved') RETURNING id, reserved_at INTO claim_id, claim_reserved_at;
  UPDATE public.businesses SET phone_number_replacement_reserved_at = claim_reserved_at, updated_at = now() WHERE id = target_business_id;
  RETURN claim_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_replacement_number_claim(uuid,uuid,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_replacement_number_claim(uuid,uuid,text,jsonb,text,text) TO lobbystack_app;
