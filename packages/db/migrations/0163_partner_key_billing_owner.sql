-- Fixes to what a partner's platform key may do (migration 0162).
--
-- A key's partner.billing scopes count only while the owner who made the key
-- is still one of the partner's active owners: an owner who is made an admin
-- or leaves the team takes the billing scopes they granted with them. The
-- key's other scopes stay. partner.billing:write grants partner.billing:read
-- too, so a key that starts a tier checkout can read it back.
CREATE OR REPLACE FUNCTION app.partner_key_has_scope(target_partner_id uuid, p_scope text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_platform_keys key
    WHERE app.current_user_id() IS NULL
      AND key.id = app.current_platform_key_id()
      AND key.partner_id = target_partner_id
      AND key.revoked_at IS NULL
      AND (key.scopes ? p_scope OR (p_scope = 'partner.billing:read' AND key.scopes ? 'partner.billing:write'))
      AND (p_scope NOT IN ('partner.billing:read', 'partner.billing:write') OR EXISTS (
        SELECT 1 FROM public.partner_members member
        WHERE member.partner_id = key.partner_id
          AND member.user_id = key.created_by_user_id
          AND member.role = 'owner'
          AND member.status = 'active'
      ))
  )
$$;
REVOKE ALL ON FUNCTION app.partner_key_has_scope(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_key_has_scope(uuid, text) TO lobbystack_app, lobbystack_worker, lobbystack_readonly;

-- A demo a key made keeps the key's id for good, since the column has no
-- foreign key, so the demo outlives its partner, whose deletion sets
-- partner_id to null, as it does for a person's demo.
ALTER TABLE public.prospect_demos DROP CONSTRAINT IF EXISTS prospect_demos_maker_check;
ALTER TABLE public.prospect_demos ADD CONSTRAINT prospect_demos_maker_check CHECK (operator_user_id IS NOT NULL OR created_by_platform_key_id IS NOT NULL) NOT VALID;
ALTER TABLE public.prospect_demos VALIDATE CONSTRAINT prospect_demos_maker_check;

-- The worker deletes the Partner endpoints' Idempotency-Key records once
-- they're past the window, for every partner at once. Only a key's own
-- transaction reaches the rows through RLS, so the worker deletes them here.
CREATE OR REPLACE FUNCTION app.prune_partner_api_idempotency_keys(p_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  deleted integer;
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's setting.
  IF COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'none') <> 'worker' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.partner_api_idempotency_keys WHERE created_at < p_before;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END $$;
REVOKE ALL ON FUNCTION app.prune_partner_api_idempotency_keys(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.prune_partner_api_idempotency_keys(timestamptz) TO lobbystack_worker;
