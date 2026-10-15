-- Whether this workspace, this user or their verified phone already had a free trial
-- number, so the app offers one only when reserve_trial_number_claim would allow it.
-- Other workspaces' trials sit behind row-level security, hence the definer function.
CREATE OR REPLACE FUNCTION app.number_trial_used(target_business_id uuid, target_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND (business_id = target_business_id OR user_id = target_user_id OR verified_phone = (SELECT phone FROM public.users WHERE id = target_user_id AND phone_verified_at IS NOT NULL)));
END $$;
REVOKE ALL ON FUNCTION app.number_trial_used(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.number_trial_used(uuid,uuid) TO lobbystack_app;
