ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS phone_number_replacement_reserved_at timestamptz;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS phone_number_replacement_used_at timestamptz;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS reclaim_reason varchar(64);
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS voice_webhook_status varchar(32);
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS voice_webhook_target_url text;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS voice_webhook_last_synced_at timestamptz;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS voice_webhook_last_error text;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS sms_webhook_status varchar(32);
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS sms_webhook_target_url text;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS sms_webhook_last_synced_at timestamptz;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS sms_webhook_last_error text;

CREATE TABLE IF NOT EXISTS public.onboarding_phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, phone_e164 varchar(32) NOT NULL, country_code varchar(2) NOT NULL, line_type varchar(32), provider_verification_id varchar(255), status varchar(32) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','pending','approved','canceled','expired','failed')), started_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, approved_at timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0), last_error text, request_fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (provider_verification_id)
);
CREATE INDEX IF NOT EXISTS onboarding_phone_verifications_business_user_idx ON public.onboarding_phone_verifications(business_id, user_id, updated_at);
CREATE INDEX IF NOT EXISTS onboarding_phone_verifications_user_phone_status_idx ON public.onboarding_phone_verifications(user_id, phone_e164, status, updated_at);
CREATE TABLE IF NOT EXISTS public.onboarding_number_claim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, requested_e164 varchar(32) NOT NULL, selection_context jsonb NOT NULL, claim_token_hash text NOT NULL, idempotency_key varchar(255) NOT NULL, status varchar(32) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','provisioning','claimed','unavailable','failed','released')), phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL, provider_phone_id varchar(255), reserved_at timestamptz NOT NULL DEFAULT now(), purchased_at timestamptz, completed_at timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0), last_error text, alternatives jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (business_id, idempotency_key), UNIQUE (provider_phone_id)
);
CREATE INDEX IF NOT EXISTS onboarding_number_claim_events_user_purchased_idx ON public.onboarding_number_claim_events(user_id, purchased_at);
CREATE INDEX IF NOT EXISTS onboarding_number_claim_events_business_status_idx ON public.onboarding_number_claim_events(business_id, status, reserved_at);
DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['onboarding_phone_verifications','onboarding_number_claim_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name); EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
  EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON public.%I', table_name, table_name);
  EXECUTE format('CREATE POLICY %I_tenant_isolation ON public.%I USING (business_id = app.current_business_id() AND (app.can_access_business(business_id) OR app.current_actor_type() = ''worker'')) WITH CHECK (business_id = app.current_business_id() AND (app.can_access_business(business_id) OR app.current_actor_type() = ''worker''))', table_name, table_name);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_app, lobbystack_worker', table_name); EXECUTE format('GRANT SELECT ON public.%I TO lobbystack_readonly', table_name);
END LOOP; END $$;

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

CREATE OR REPLACE FUNCTION app.claim_phone_verification_check(target_business_id uuid, target_user_id uuid, target_attempt_id uuid)
RETURNS TABLE(provider_verification_id text, phone_e164 text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY UPDATE public.onboarding_phone_verifications AS verification SET attempt_count = verification.attempt_count + 1, updated_at = now()
    WHERE verification.id = target_attempt_id AND verification.business_id = target_business_id AND verification.user_id = target_user_id AND verification.status = 'pending' AND verification.expires_at > now() AND verification.attempt_count < 6 AND verification.provider_verification_id IS NOT NULL
    RETURNING verification.provider_verification_id::text, verification.phone_e164::text;
END $$;
REVOKE ALL ON FUNCTION app.claim_phone_verification_check(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_phone_verification_check(uuid,uuid,uuid) TO lobbystack_app;

CREATE OR REPLACE FUNCTION app.complete_phone_verification(target_business_id uuid, target_user_id uuid, target_attempt_id uuid, provider_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.onboarding_phone_verifications SET status = 'approved', approved_at = now(), updated_at = now(), last_error = NULL WHERE id = target_attempt_id AND business_id = target_business_id AND user_id = target_user_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.users SET phone = (SELECT phone_e164 FROM public.onboarding_phone_verifications WHERE id = target_attempt_id), phone_verified_at = now(), updated_at = now() WHERE id = target_user_id;
  UPDATE public.businesses SET onboarding_stage = 'plan', updated_at = now() WHERE id = target_business_id AND onboarding_stage IN ('verify_phone','verify_phone_code');
  RETURN provider_status = 'approved';
END $$;
REVOKE ALL ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) TO lobbystack_app;

CREATE OR REPLACE FUNCTION app.record_phone_verification_check_failure(target_business_id uuid, target_user_id uuid, target_attempt_id uuid, provider_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.onboarding_phone_verifications SET status = CASE WHEN provider_status IN ('canceled','expired','failed') THEN provider_status ELSE 'pending' END, last_error = 'Verification code was not approved.', updated_at = now() WHERE id = target_attempt_id AND business_id = target_business_id AND user_id = target_user_id;
END $$;
REVOKE ALL ON FUNCTION app.record_phone_verification_check_failure(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_phone_verification_check_failure(uuid,uuid,uuid,text) TO lobbystack_app;

CREATE OR REPLACE FUNCTION app.reuse_verified_phone_for_business(target_business_id uuid, target_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE source_attempt public.onboarding_phone_verifications%ROWTYPE; new_id uuid;
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT v.* INTO source_attempt FROM public.onboarding_phone_verifications v JOIN public.users u ON u.id = target_user_id WHERE v.user_id = target_user_id AND v.status = 'approved' AND v.phone_e164 = u.phone AND u.phone_verified_at IS NOT NULL ORDER BY v.approved_at DESC LIMIT 1;
  IF source_attempt.id IS NULL THEN RAISE EXCEPTION 'verified_phone_unavailable' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_phone_verifications(business_id,user_id,phone_e164,country_code,line_type,provider_verification_id,status,started_at,expires_at,approved_at,request_fingerprint) VALUES(target_business_id,target_user_id,source_attempt.phone_e164,source_attempt.country_code,source_attempt.line_type,NULL,'approved',now(),now(),now(),source_attempt.request_fingerprint) RETURNING id INTO new_id;
  UPDATE public.businesses SET onboarding_stage = 'plan', updated_at = now() WHERE id = target_business_id AND onboarding_stage IN ('verify_phone','verify_phone_code');
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION app.reuse_verified_phone_for_business(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reuse_verified_phone_for_business(uuid,uuid) TO lobbystack_app;
