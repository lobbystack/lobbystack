-- When the opt-in confirmation went out for the contact's current yes to
-- texts: the first text a business sends a customer, which names the host and
-- the business. The worker sends it before any other text while this is null.
-- STOP, a no to texts, and a new number clear it; a START reply sets it, since
-- that reply confirms the opt-in itself.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS sms_opt_in_confirmed_at timestamptz;
