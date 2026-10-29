-- A Cal.com connection registers a webhook with Cal.com, so a booking made
-- there updates the business's busy time within seconds instead of at the
-- next scheduled sync. The secret signs each delivery and is encrypted with
-- ENCRYPTION_KEY, like the connection's tokens.
ALTER TABLE public.calendar_connections ADD COLUMN IF NOT EXISTS external_webhook_id text;
ALTER TABLE public.calendar_connections ADD COLUMN IF NOT EXISTS encrypted_webhook_secret text;

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
