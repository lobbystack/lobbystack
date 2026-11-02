-- Calendly connections register a webhook too, so the lookup its route runs
-- before any business context exists has to find them.
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
    AND connection.provider IN ('calcom', 'calendly')
    AND connection.status <> 'disconnected'
    AND business.status = 'active'
  LIMIT 1
$$;
