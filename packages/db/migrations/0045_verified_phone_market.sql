-- Only the signed-in administrator's currently verified phone can select a market.
-- Returning this through a narrow function permits reuse across their workspaces
-- without exposing verification records belonging to another tenant or user.
CREATE OR REPLACE FUNCTION app.resolve_verified_phone_market(target_business_id uuid, target_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
  SELECT jsonb_build_object('phoneE164', u.phone, 'countryCode', v.country_code)
  FROM public.users u
  JOIN public.onboarding_phone_verifications v ON v.user_id = u.id AND v.phone_e164 = u.phone
  WHERE session_user = 'lobbystack_app'
    AND target_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    AND target_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
    AND app.has_business_membership(target_business_id)
    AND u.id = target_user_id AND u.phone_verified_at IS NOT NULL
    AND v.status = 'approved'
  ORDER BY v.approved_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.resolve_verified_phone_market(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_verified_phone_market(uuid,uuid) TO lobbystack_app;
