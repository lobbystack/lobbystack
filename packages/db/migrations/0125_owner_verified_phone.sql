-- The owner's verified mobile, where a call goes when the receptionist can't
-- take it and the business set no transfer number. Row-level security hides
-- users from the worker, so this answers only for the business bound to the
-- calling worker transaction, and only with a phone the owner verified.
CREATE OR REPLACE FUNCTION app.resolve_business_owner_verified_phone(target_business_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT u.phone
  FROM public.business_memberships m
  JOIN public.users u ON u.id = m.user_id
  WHERE session_user = 'lobbystack_worker'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'worker'
    AND target_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
    AND m.business_id = target_business_id
    AND m.role = 'business_owner'
    AND m.status = 'active'
    AND u.phone IS NOT NULL
    AND u.phone_verified_at IS NOT NULL
  ORDER BY m.created_at
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.resolve_business_owner_verified_phone(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_owner_verified_phone(uuid) TO lobbystack_worker;
