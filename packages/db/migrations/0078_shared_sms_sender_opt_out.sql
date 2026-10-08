-- Cloud businesses text their customers from one shared number
-- (TWILIO_ALERT_SMS_FROM) that no business owns. Twilio blocks every text from
-- that number to a phone that replies STOP, whichever business sent it, so the
-- worker opts that phone out at every business that has it as a contact. START
-- restores the status each contact had before the STOP, kept in this column.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS sms_consent_status_before_opt_out varchar(32);

-- Lists the businesses with a contact at this phone number, for the worker
-- applying a STOP or START sent to the shared number. The worker can't find
-- them through RLS, since no business owns that number. It gets business ids
-- only, then changes each business's contacts in a transaction bound to that
-- business, under the contacts and sms_consent_events policies.
CREATE OR REPLACE FUNCTION app.list_businesses_by_contact_phone(p_phone text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT c.business_id
  FROM public.contacts c
  WHERE c.phone = p_phone
    AND session_user = 'lobbystack_worker'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'worker'
$$;

REVOKE ALL ON FUNCTION app.list_businesses_by_contact_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_businesses_by_contact_phone(text) TO lobbystack_worker;
