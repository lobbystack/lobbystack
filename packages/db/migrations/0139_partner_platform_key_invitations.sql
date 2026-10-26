-- A partner's platform key creates businesses for the partner (ADR 0010),
-- and creating one invites its owner. The key acts as the partner, which has
-- no account, so the invitation names the key instead of a person. Like a
-- webhook endpoint's created_by_platform_key_id, the column has no foreign
-- key: a host's keys live in PLATFORM_API_KEYS, not in a table. A claim link
-- hands a business over from the account that sent it, so it always names
-- that account. The check is NOT VALID, so this file doesn't read every
-- invitation while it holds the lock that blocks them; the next migration
-- validates it under a lighter lock.
ALTER TABLE public.business_invitations ADD COLUMN IF NOT EXISTS invited_by_platform_key_id uuid;
ALTER TABLE public.business_invitations ALTER COLUMN invited_by_user_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.business_invitations'::regclass AND conname = 'business_invitations_inviter_check') THEN
    ALTER TABLE public.business_invitations ADD CONSTRAINT business_invitations_inviter_check CHECK (invited_by_user_id IS NOT NULL OR (invited_by_platform_key_id IS NOT NULL AND NOT transfers_ownership)) NOT VALID;
  END IF;
END
$$;

-- Revoking a partner's key also revokes the invitations it sent to join a
-- business's team that nobody accepted yet, in the transaction that revokes
-- it, so a leaked key can't leave an invitation behind for someone to accept
-- later. The invitation to own a business, which the key sends as it creates
-- the business, stays: the console can't send another, and the business
-- stays the partner's either way. The partner's owners and admins aren't on
-- its businesses' teams, so this reads every business's invitations, and only
-- for an owner or admin of the key's partner once the key is revoked. Returns
-- the invitations it revoked. Only lobbystack_app, which the console uses,
-- may call it.
CREATE OR REPLACE FUNCTION app.revoke_partner_platform_key_invitations(p_key_id uuid)
RETURNS TABLE (invitation_id uuid, business_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's setting.
  IF NULLIF(current_setting('app.actor_type', true), '') IS DISTINCT FROM 'operator'
    OR NOT EXISTS (
      SELECT 1 FROM public.partner_platform_keys key
      WHERE key.id = p_key_id AND key.revoked_at IS NOT NULL AND app.partner_role(key.partner_id) IN ('owner', 'admin')
    ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH revoked AS (
    UPDATE public.business_invitations invitation
    SET status = 'revoked', updated_at = now()
    WHERE invitation.invited_by_platform_key_id = p_key_id
      AND invitation.status = 'pending'
      AND invitation.role <> 'business_owner'
    RETURNING invitation.id, invitation.business_id
  ), audited AS (
    INSERT INTO public.audit_logs (business_id, actor_user_id, event_type, entity_type, entity_id, payload)
    SELECT revoked.business_id, app.current_user_id(), 'business_invitation.revoked', 'business_invitation', revoked.id, jsonb_build_object('reason', 'platform_key_revoked', 'platformKeyId', p_key_id)
    FROM revoked
    RETURNING entity_id, audit_logs.business_id
  )
  SELECT audited.entity_id, audited.business_id FROM audited;
END $$;
REVOKE ALL ON FUNCTION app.revoke_partner_platform_key_invitations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revoke_partner_platform_key_invitations(uuid) TO lobbystack_app;
