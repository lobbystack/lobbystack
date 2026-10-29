-- A Cal.com connection registers a webhook with Cal.com, so a booking made
-- there updates the business's busy time within seconds instead of at the
-- next scheduled sync. The secret signs each delivery and is encrypted with
-- ENCRYPTION_KEY, like the connection's tokens.
ALTER TABLE public.calendar_connections ADD COLUMN IF NOT EXISTS external_webhook_id text;
ALTER TABLE public.calendar_connections ADD COLUMN IF NOT EXISTS encrypted_webhook_secret text;
-- Until when one sync holds the right to register the webhook. Registration calls Cal.com outside any
-- transaction, so this lease, not a row lock, keeps two syncs from registering two webhooks.
ALTER TABLE public.calendar_connections ADD COLUMN IF NOT EXISTS webhook_registration_until timestamptz;
-- When the connection was disconnected. A disconnected Cal.com connection keeps its tokens until a job
-- cancels its bookings and removes its webhook, and a sweep forgets them a week after this either way.
-- Token refreshes touch updated_at, so the sweep can't measure from it.
ALTER TABLE public.calendar_connections ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;
UPDATE public.calendar_connections SET disconnected_at = updated_at WHERE status = 'disconnected' AND disconnected_at IS NULL;

-- The webhook URL names only the connection, so the route finds its
-- business before any business context exists.
CREATE OR REPLACE FUNCTION app.resolve_business_by_calendar_webhook(p_connection_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT connection.business_id
  FROM public.calendar_connections connection
  JOIN public.businesses business ON business.id = connection.business_id
  WHERE connection.id = p_connection_id
    AND connection.provider = 'calcom'
    AND connection.status <> 'disconnected'
    AND business.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_calendar_webhook(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_calendar_webhook(uuid) TO lobbystack_app, lobbystack_worker;

-- Forgets the tokens and webhook of every connection disconnected before the
-- cutoff, across all businesses, whatever became of the job that should have
-- cancelled its bookings and removed its webhook. Only the worker calls it.
CREATE OR REPLACE FUNCTION app.forget_stale_retired_calendar_tokens(p_disconnected_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  cleared integer;
BEGIN
  IF session_user <> 'lobbystack_worker' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.calendar_connections
  SET encrypted_access_token = NULL, encrypted_refresh_token = NULL, external_webhook_id = NULL, encrypted_webhook_secret = NULL, webhook_registration_until = NULL, updated_at = now()
  WHERE status = 'disconnected'
    AND disconnected_at < p_disconnected_before
    AND (encrypted_access_token IS NOT NULL OR encrypted_refresh_token IS NOT NULL OR external_webhook_id IS NOT NULL);
  GET DIAGNOSTICS cleared = ROW_COUNT;
  RETURN cleared;
END $$;

REVOKE ALL ON FUNCTION app.forget_stale_retired_calendar_tokens(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.forget_stale_retired_calendar_tokens(timestamptz) TO lobbystack_worker;
