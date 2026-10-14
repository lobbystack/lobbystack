-- Free trial numbers: 14 days, no card. A business gets one when its owner has
-- verified a mobile phone in the number's country. The trial row holds the
-- trial's clock and the emails already sent. When the trial ends the
-- receptionist stops answering, and the number stays ours until its paid month
-- at Twilio runs out (phone_numbers.reclaim_scheduled_at), so an owner who
-- subscribes in that window gets the same number back.
CREATE TABLE IF NOT EXISTS public.number_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES public.onboarding_number_claim_events(id) ON DELETE SET NULL,
  phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  verified_phone varchar(32) NOT NULL,
  -- HMAC of the request's IP address, to limit trials per address without storing it.
  ip_hash text,
  status varchar(16) NOT NULL DEFAULT 'reserved',
  started_at timestamptz,
  ends_at timestamptz,
  minutes_exhausted_at timestamptz,
  -- Which trial emails went out, keyed by email, with the time each was queued.
  emails_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT number_trials_status_check CHECK (status IN ('reserved', 'active', 'ended', 'converted', 'released', 'failed')),
  CONSTRAINT number_trials_emails_object CHECK (jsonb_typeof(emails_sent) = 'object')
);
-- A failed purchase doesn't use up the business's trial.
CREATE UNIQUE INDEX IF NOT EXISTS number_trials_business_unique ON public.number_trials(business_id) WHERE status <> 'failed';
CREATE INDEX IF NOT EXISTS number_trials_phone_idx ON public.number_trials(verified_phone);
CREATE INDEX IF NOT EXISTS number_trials_user_idx ON public.number_trials(user_id);
CREATE INDEX IF NOT EXISTS number_trials_ip_created_idx ON public.number_trials(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS number_trials_claim_idx ON public.number_trials(claim_id);

-- Owners in a country without numbers ask to hear when numbers arrive there.
CREATE TABLE IF NOT EXISTS public.number_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  country_code varchar(2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS number_waitlist_business_country_unique ON public.number_waitlist(business_id, country_code);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['number_trials', 'number_waitlist'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON public.%I USING (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id))) WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id)))',
      table_name, table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_app, lobbystack_worker', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO lobbystack_readonly', table_name);
  END LOOP;
END
$$;

-- Reserves a trial number for a cloud business without a paid plan. Paid
-- businesses claim through reserve_onboarding_number_claim. A trial needs the
-- user's verified phone, and each business, user, verified phone and (for 30
-- days) IP address gets one. The checks read other businesses' trials, which
-- row-level security hides, so they run here.
CREATE OR REPLACE FUNCTION app.reserve_trial_number_claim(target_business_id uuid, target_user_id uuid, target_e164 text, selection jsonb, token_hash text, request_key text, request_ip_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE new_claim_id uuid; business_row public.businesses%ROWTYPE; account_plan text; account_state text; user_phone text; user_phone_verified_at timestamptz;
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
  SELECT plan, subscription_state INTO account_plan, account_state FROM public.billing_accounts WHERE business_id = target_business_id;
  IF account_plan IN ('starter','pro','enterprise') AND COALESCE(account_state,'') IN ('active','trialing','past_due') THEN RAISE EXCEPTION 'trial_not_needed' USING ERRCODE = 'P0001'; END IF;
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

-- Phone verification is back in onboarding, right before the number step, so
-- a verified phone moves the workspace on to choosing a number.
CREATE OR REPLACE FUNCTION app.complete_phone_verification(target_business_id uuid, target_user_id uuid, target_attempt_id uuid, provider_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.onboarding_phone_verifications SET status = 'approved', approved_at = now(), updated_at = now(), last_error = NULL WHERE id = target_attempt_id AND business_id = target_business_id AND user_id = target_user_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.users SET phone = (SELECT phone_e164 FROM public.onboarding_phone_verifications WHERE id = target_attempt_id), phone_verified_at = now(), updated_at = now() WHERE id = target_user_id;
  UPDATE public.businesses SET onboarding_stage = 'phone_number', updated_at = now() WHERE id = target_business_id AND onboarding_stage = 'verify_phone';
  RETURN provider_status = 'approved';
END $$;
REVOKE ALL ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) TO lobbystack_app;

-- The owner a worker emails about the business's number and plan. Row-level
-- security hides users from the worker, so this answers only for the business
-- bound to the calling worker transaction.
CREATE OR REPLACE FUNCTION app.resolve_business_owner_contact(target_business_id uuid)
RETURNS TABLE(user_id uuid, email text, name text, preferred_locale text, business_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT u.id, u.email, u.name, u.preferred_locale::text, b.name
  FROM public.businesses b
  JOIN public.business_memberships m ON m.business_id = b.id AND m.role = 'business_owner' AND m.status = 'active'
  JOIN public.users u ON u.id = m.user_id
  WHERE session_user = 'lobbystack_worker'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'worker'
    AND target_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
    AND b.id = target_business_id
  ORDER BY m.created_at
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.resolve_business_owner_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_owner_contact(uuid) TO lobbystack_worker;
