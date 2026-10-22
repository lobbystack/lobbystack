-- A claim link hands a business someone set up for its owner over to them
-- (D2): an owner invitation that, once accepted, also takes the account that
-- sent it off the team. A platform key's operator or partner account uses it
-- to give away the businesses it onboards.
ALTER TABLE public.business_invitations ADD COLUMN IF NOT EXISTS transfers_ownership boolean NOT NULL DEFAULT false;

-- Accepting a claim link ends the sender's access, as a claimed prospect demo
-- does: the links that let a partner's platform keys reach the business go,
-- and the sender's account stops opening it. The dashboard's app role runs the
-- acceptance as the system actor but may do neither itself, and this does
-- them only once that sender's claim link for the business was accepted.
CREATE OR REPLACE FUNCTION app.finish_business_handover(p_business_id uuid, p_sender_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's settings.
  IF NULLIF(current_setting('app.actor_type', true), '') IS DISTINCT FROM 'system'
    OR p_business_id IS DISTINCT FROM NULLIF(current_setting('app.business_id', true), '')::uuid
    OR NOT EXISTS (SELECT 1 FROM public.business_invitations WHERE business_id = p_business_id AND invited_by_user_id = p_sender_user_id AND transfers_ownership AND status = 'accepted') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.platform_partner_businesses WHERE business_id = p_business_id;
  UPDATE public.users SET active_business_id = NULL, updated_at = now() WHERE id = p_sender_user_id AND active_business_id = p_business_id;
END $$;
REVOKE ALL ON FUNCTION app.finish_business_handover(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.finish_business_handover(uuid, uuid) TO lobbystack_app;
