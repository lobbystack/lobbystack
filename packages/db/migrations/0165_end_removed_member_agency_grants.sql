-- Removing someone from a partner's team ends their agency connections to
-- that partner (ADR 0011), so re-adding them later doesn't bring the old
-- grants back. The partner's console and its platform keys remove people
-- with the app role, and a key has no person behind it, so it can neither
-- reach the person's grants through oauth_consents_partner nor write a
-- partner_audit_logs row as itself. This function does both, in the
-- removal's transaction: it revokes every access and refresh token the
-- person holds for the partner, deletes their grants, and records each one
-- as oauth_grant.revoked. It answers only an owner, an admin or an active key
-- of the partner, and only for someone no longer on its team. A role change
-- keeps the grants: the MCP server reads the role on every request.
CREATE OR REPLACE FUNCTION app.revoke_removed_partner_member_oauth_grants(p_partner_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  reference text := 'partner:' || p_partner_id::text;
  key_id uuid := app.current_platform_key_id();
  grant_row record;
  revoked_count integer := 0;
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's setting.
  IF current_setting('app.actor_type', true) IS DISTINCT FROM 'operator' OR COALESCE(app.partner_role(p_partner_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only the partner''s owners, admins and keys end a removed person''s agency connections.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_members member WHERE member.partner_id = p_partner_id AND member.user_id = p_user_id AND member.status = 'active') THEN
    RAISE EXCEPTION 'The person is still on the partner''s team.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.oauth_access_tokens SET revoked = now() WHERE reference_id = reference AND user_id = p_user_id AND revoked IS NULL;
  UPDATE public.oauth_refresh_tokens SET revoked = now() WHERE reference_id = reference AND user_id = p_user_id AND revoked IS NULL;
  FOR grant_row IN DELETE FROM public.oauth_consents WHERE reference_id = reference AND user_id = p_user_id RETURNING id, client_id LOOP
    INSERT INTO public.partner_audit_logs (partner_id, actor_user_id, event_type, entity_type, entity_id, payload)
    VALUES (p_partner_id, app.current_user_id(), 'oauth_grant.revoked', 'oauth_grant', grant_row.id,
      jsonb_build_object('grantId', grant_row.id, 'clientId', grant_row.client_id, 'grantedByUserId', p_user_id, 'reason', 'member_removed')
        || CASE WHEN app.current_user_id() IS NULL AND key_id IS NOT NULL THEN jsonb_build_object('actor', 'platform_key', 'platformKeyId', key_id) ELSE '{}'::jsonb END);
    revoked_count := revoked_count + 1;
  END LOOP;
  RETURN revoked_count;
END;
$$;
REVOKE ALL ON FUNCTION app.revoke_removed_partner_member_oauth_grants(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revoke_removed_partner_member_oauth_grants(uuid, uuid) TO lobbystack_app;
