-- Telnyx replaces the dialled number with the OpenAI project ID in the
-- Request-URI and To, and adds no Diversion, so a GPT-Live webhook can't tell
-- which number a Telnyx call was for. Each Telnyx number gets its own SIP
-- connection instead, and every INVITE names it in X-Telnyx-Connection-id.
-- This column holds that connection, so the webhook can find the number.
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS carrier_connection_id varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_carrier_connection_unique
  ON public.phone_numbers (carrier, carrier_connection_id)
  WHERE carrier_connection_id IS NOT NULL AND status <> 'reclaimed';

-- The webhook runs before any business is known, like resolve_business_by_phone.
CREATE OR REPLACE FUNCTION app.resolve_phone_by_carrier_connection(p_carrier text, p_connection_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT e164 FROM public.phone_numbers
  WHERE carrier = p_carrier AND carrier_connection_id = p_connection_id AND status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_phone_by_carrier_connection(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_phone_by_carrier_connection(text, text) TO lobbystack_app, lobbystack_worker;
