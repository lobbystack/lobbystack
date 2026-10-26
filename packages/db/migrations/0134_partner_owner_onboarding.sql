-- The owner a partner invites onboards with less than a direct owner. Their
-- partner gives the business its numbers, and the host asks no attribution,
-- so verifying the owner's phone finishes onboarding. The phone stays,
-- because calls forward to it. The dashboard also needs each business's
-- access level to hide what its operators can't use.

-- Verifying the phone moves a direct business on to the number step, and
-- finishes a partner's business. Everything else is as 0101 defined it.
CREATE OR REPLACE FUNCTION app.complete_phone_verification(target_business_id uuid, target_user_id uuid, target_attempt_id uuid, provider_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.onboarding_phone_verifications SET status = 'approved', approved_at = now(), updated_at = now(), last_error = NULL WHERE id = target_attempt_id AND business_id = target_business_id AND user_id = target_user_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.users SET phone = (SELECT phone_e164 FROM public.onboarding_phone_verifications WHERE id = target_attempt_id), phone_verified_at = now(), updated_at = now() WHERE id = target_user_id;
  UPDATE public.businesses SET onboarding_stage = CASE WHEN partner_id IS NULL THEN 'phone_number' ELSE 'complete' END, updated_at = now() WHERE id = target_business_id AND onboarding_stage = 'verify_phone';
  RETURN provider_status = 'approved';
END $$;
REVOKE ALL ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) TO lobbystack_app;

-- The workspace list also gives each business's access level, which a
-- direct business ignores. Adding a column changes the result type, which
-- CREATE OR REPLACE can't do. Everything else is as 0132 defined it.
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
  created_at timestamptz,
  partner_id uuid,
  partner_access_level varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.slug, membership.role,
    business.timezone, business.business_type, business.default_locale,
    business.website_url, business.onboarding_stage, business.created_at,
    business.partner_id, business.partner_access_level
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
  ORDER BY business.name
$$;

REVOKE ALL ON FUNCTION app.list_user_businesses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_user_businesses(uuid) TO lobbystack_app;
