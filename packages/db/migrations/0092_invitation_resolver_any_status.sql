-- The accept page previews an invitation to say whether it expired, but this
-- resolver only found pending, unexpired invitations, so an old link showed
-- "invalid link". Find the invitation whatever its state. acceptInvitation
-- still checks the status and expiry inside its own transaction.
CREATE OR REPLACE FUNCTION app.resolve_business_by_invitation(p_token_hash text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business_id FROM public.business_invitations WHERE token_hash = p_token_hash LIMIT 1
$$;
