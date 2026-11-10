-- The welcome email goes to the first active owner of a business that just
-- finished onboarding. It replaces the founder's check-in, whose resolver
-- stays until no worker from an earlier release can still call it.
CREATE OR REPLACE FUNCTION app.resolve_onboarding_welcome_recipient(target_business_id uuid)
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
    AND b.status = 'active'
    AND b.onboarding_stage = 'complete'
  ORDER BY m.created_at
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_onboarding_welcome_recipient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_onboarding_welcome_recipient(uuid) TO lobbystack_worker;
