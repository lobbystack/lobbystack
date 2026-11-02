-- What the owner wants their agent to do first, asked in onboarding right
-- before attribution. Null means they skipped it or finished onboarding before
-- the question existed. A partner's business never gets the question.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS onboarding_goal varchar(32);

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_onboarding_goal_valid;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_onboarding_goal_valid CHECK (
    onboarding_goal IS NULL OR onboarding_goal IN ('answer_calls', 'book_appointments', 'answer_website_visitors', 'answer_instagram_messages')
  );

-- The goal stage comes after the number step, so an owner can still go back
-- and claim a number from it, and a claim leaves the stage where it is. Only
-- the two stage checks differ from 0159.
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
  IF business_row.onboarding_stage NOT IN ('plan','phone_number','goal','attribution','complete') THEN RAISE EXCEPTION 'invalid_onboarding_stage' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.phone_numbers WHERE business_id = target_business_id AND status IN ('active','provisioning')) THEN RAISE EXCEPTION 'business_number_exists' USING ERRCODE = 'P0001'; END IF;
  IF business_row.deployment_mode = 'cloud' AND NOT app.has_live_entitlement(target_business_id) THEN RAISE EXCEPTION 'dedicated_number_requires_paid_plan' USING ERRCODE = 'P0001'; END IF;
  IF NOT partner_member_claim THEN
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND reserved_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '1 day') >= 2 THEN RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
    IF (SELECT count(*) FROM public.onboarding_number_claim_events WHERE user_id = target_user_id AND NOT by_partner_member AND status = 'claimed' AND purchased_at >= now() - interval '30 days') >= 5 THEN RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001'; END IF;
  END IF;
  INSERT INTO public.onboarding_number_claim_events(business_id,user_id,requested_e164,selection_context,claim_token_hash,idempotency_key,status,by_partner_member) VALUES(target_business_id,target_user_id,target_e164,selection,token_hash,request_key,'reserved',partner_member_claim) ON CONFLICT (business_id,idempotency_key) DO UPDATE SET updated_at = onboarding_number_claim_events.updated_at RETURNING id INTO claim_id;
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('goal','attribution','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
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
  IF business_row.onboarding_stage NOT IN ('phone_number','goal','attribution','complete') THEN RAISE EXCEPTION 'invalid_onboarding_stage' USING ERRCODE = 'P0001'; END IF;
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
  UPDATE public.businesses SET onboarding_stage = CASE WHEN onboarding_stage IN ('goal','attribution','complete') THEN onboarding_stage ELSE 'phone_number_claiming' END, updated_at = now() WHERE id = target_business_id;
  RETURN new_claim_id;
END $$;

-- The dashboard reads the answer from the workspace list. Adding a column
-- changes the result type, which CREATE OR REPLACE can't do. Only the
-- onboarding_goal column differs from 0136.
DROP FUNCTION IF EXISTS app.list_user_businesses(uuid);

CREATE FUNCTION app.list_user_businesses(p_user_id uuid)
RETURNS TABLE (
  business_id uuid,
  name text,
  slug varchar,
  role varchar,
  timezone varchar,
  business_type varchar,
  default_locale varchar,
  website_url text,
  onboarding_stage varchar,
  onboarding_goal varchar,
  created_at timestamptz,
  partner_id uuid,
  partner_access_level varchar,
  access_via varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.slug, membership.role,
    business.timezone, business.business_type, business.default_locale,
    business.website_url, business.onboarding_stage, business.onboarding_goal, business.created_at,
    business.partner_id, business.partner_access_level, 'membership'::varchar
  FROM public.business_memberships membership
  INNER JOIN public.businesses business ON business.id = membership.business_id
  WHERE membership.user_id = p_user_id
    AND p_user_id = app.current_user_id()
    AND membership.status = 'active'
    AND business.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.prospect_demos demo
      WHERE demo.business_id = business.id
        AND demo.operator_user_id = p_user_id
        AND demo.claimed_by_user_id IS DISTINCT FROM p_user_id
        AND (demo.status IN ('revoked', 'claimed') OR demo.expires_at <= now())
    )
  UNION ALL
  SELECT business.id, business.name, business.slug, 'business_admin'::varchar,
    business.timezone, business.business_type, business.default_locale,
    business.website_url, business.onboarding_stage, business.onboarding_goal, business.created_at,
    business.partner_id, business.partner_access_level, 'partner'::varchar
  FROM public.partner_business_opens opened
  INNER JOIN public.businesses business ON business.id = opened.business_id AND business.partner_id = opened.partner_id
  INNER JOIN public.partner_members member ON member.partner_id = opened.partner_id AND member.user_id = opened.user_id AND member.status = 'active'
  WHERE opened.user_id = p_user_id
    AND p_user_id = app.current_user_id()
    AND opened.expires_at > now()
    AND business.status = 'active'
    -- Someone on the team as well reaches it through the team.
    AND NOT EXISTS (
      SELECT 1
      FROM public.business_memberships own
      WHERE own.business_id = business.id
        AND own.user_id = p_user_id
        AND own.status = 'active'
    )
  ORDER BY 2, 1
$$;

REVOKE ALL ON FUNCTION app.list_user_businesses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_user_businesses(uuid) TO lobbystack_app;
