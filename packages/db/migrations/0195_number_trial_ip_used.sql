-- Whether a free trial already started from this network in the last 30 days,
-- across every workspace. Other workspaces' trials sit behind row-level
-- security, so the number step's pre-check reads them the way the claim does:
-- through a definer function with the same session checks.
CREATE OR REPLACE FUNCTION app.number_trial_ip_used(target_business_id uuid, target_user_id uuid, request_ip_hash text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_business_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF request_ip_hash IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.number_trials WHERE status <> 'failed' AND ip_hash = request_ip_hash AND created_at >= now() - interval '30 days');
END $$;
REVOKE ALL ON FUNCTION app.number_trial_ip_used(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.number_trial_ip_used(uuid, uuid, text) TO lobbystack_app;
