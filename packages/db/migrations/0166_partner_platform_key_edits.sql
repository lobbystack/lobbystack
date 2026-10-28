-- Owners and admins can change a partner's platform key: its name and its
-- scopes. The key itself stays the same.
--
-- The partner.billing scopes count only while the owner who granted them is
-- one of the partner's active owners (migration 0163). That owner used to be
-- the key's creator. Now an owner can add the billing scopes to a key someone
-- else made, so the key records who granted them in
-- billing_scopes_granted_by_user_id: the owner who last saved the key with a
-- billing scope. A key without one has none. Only an owner can save a key
-- that has or had a billing scope, so an admin can neither add them nor take
-- them off, and their granter can only be an owner. Revoking stays open to
-- owners and admins for every key.
ALTER TABLE public.partner_platform_keys
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_scopes_granted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.partner_platform_keys
SET billing_scopes_granted_by_user_id = created_by_user_id
WHERE billing_scopes_granted_by_user_id IS NULL
  AND scopes ?| ARRAY['partner.billing:read', 'partner.billing:write'];

-- The billing scopes now follow whoever granted them, not the key's creator.
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
          AND member.user_id = key.billing_scopes_granted_by_user_id
          AND member.role = 'owner'
          AND member.status = 'active'
      ))
  )
$$;
REVOKE ALL ON FUNCTION app.partner_key_has_scope(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_key_has_scope(uuid, text) TO lobbystack_app, lobbystack_worker, lobbystack_readonly;

-- The owner a key's billing calls act for, such as the person a tier
-- checkout is made out to: the owner who granted its billing scopes, while
-- they're still an active owner.
CREATE OR REPLACE FUNCTION app.partner_platform_key_owner(p_partner_id uuid, p_key_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT key.billing_scopes_granted_by_user_id
  FROM public.partner_platform_keys key
  JOIN public.partner_members member
    ON member.partner_id = key.partner_id AND member.user_id = key.billing_scopes_granted_by_user_id AND member.status = 'active' AND member.role = 'owner'
  WHERE key.id = p_key_id AND key.partner_id = p_partner_id AND key.revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION app.partner_platform_key_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_platform_key_owner(uuid, uuid) TO lobbystack_app;

-- A new key with a billing scope names its maker as their granter, and only an owner may make one.
DROP POLICY IF EXISTS partner_platform_keys_admin_insert ON public.partner_platform_keys;
CREATE POLICY partner_platform_keys_admin_insert ON public.partner_platform_keys FOR INSERT
  WITH CHECK (
    app.current_actor_type() = 'operator'
    AND app.partner_role(partner_id) IN ('owner', 'admin')
    AND created_by_user_id = app.current_user_id()
    AND revoked_at IS NULL AND revoked_by_user_id IS NULL AND last_used_at IS NULL AND updated_by_user_id IS NULL
    AND CASE WHEN scopes ?| ARRAY['partner.billing:read', 'partner.billing:write']
      THEN billing_scopes_granted_by_user_id = app.current_user_id() AND app.partner_role(partner_id) = 'owner'
      ELSE billing_scopes_granted_by_user_id IS NULL END
  );

-- One policy covers both changes. Permissive policies combine with OR, so a
-- second UPDATE policy would let a row pass one policy's USING and the
-- other's WITH CHECK. A change either revokes the key as the person, or
-- edits a live key as the person, with the billing granter it then needs.
DROP POLICY IF EXISTS partner_platform_keys_admin_revoke ON public.partner_platform_keys;
DROP POLICY IF EXISTS partner_platform_keys_admin_update ON public.partner_platform_keys;
CREATE POLICY partner_platform_keys_admin_update ON public.partner_platform_keys FOR UPDATE
  USING (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin') AND revoked_at IS NULL)
  WITH CHECK (
    app.current_actor_type() = 'operator'
    AND app.partner_role(partner_id) IN ('owner', 'admin')
    AND (
      (revoked_at IS NOT NULL AND revoked_by_user_id = app.current_user_id())
      OR (
        revoked_at IS NULL AND revoked_by_user_id IS NULL
        AND updated_by_user_id = app.current_user_id()
        AND CASE WHEN scopes ?| ARRAY['partner.billing:read', 'partner.billing:write']
          THEN billing_scopes_granted_by_user_id = app.current_user_id() AND app.partner_role(partner_id) = 'owner'
          ELSE billing_scopes_granted_by_user_id IS NULL END
      )
    )
  );

-- A policy sees only the new row, so this trigger holds the rule about the
-- old one: a key that had a billing scope changes its name or scopes only by
-- an owner's hand, so an admin can't take the billing scopes off either.
-- The definer functions that touch last_used_at change neither column.
CREATE OR REPLACE FUNCTION app.guard_partner_platform_key_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.revoked_at IS NULL
    AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.scopes IS DISTINCT FROM OLD.scopes)
    AND OLD.scopes ?| ARRAY['partner.billing:read', 'partner.billing:write']
    AND app.partner_role(OLD.partner_id) IS DISTINCT FROM 'owner'
  THEN
    RAISE EXCEPTION 'Only an owner can change a platform key that holds a partner.billing scope.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_partner_platform_key_edit() FROM PUBLIC;

DROP TRIGGER IF EXISTS partner_platform_keys_guard_edit ON public.partner_platform_keys;
CREATE TRIGGER partner_platform_keys_guard_edit
  BEFORE UPDATE ON public.partner_platform_keys
  FOR EACH ROW EXECUTE FUNCTION app.guard_partner_platform_key_edit();

GRANT UPDATE (name, scopes, updated_by_user_id, billing_scopes_granted_by_user_id) ON public.partner_platform_keys TO lobbystack_app;
