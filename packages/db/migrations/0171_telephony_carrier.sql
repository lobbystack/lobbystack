-- The carrier behind each number, text and phone call, so operations on a
-- number go to the carrier that owns it while one deployment buys numbers
-- from several (TELEPHONY_NUMBERS). Every row before this one is Twilio's.
--
-- calls.provider and messages' provider columns name the AI runtime and the
-- provider ids, not the carrier, so the carrier gets its own column.
--
-- No list of carriers in a check constraint: a new carrier is a new adapter,
-- and the app checks the value against its own list. The format check keeps
-- out anything that isn't a carrier id.

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS carrier varchar(32) NOT NULL DEFAULT 'twilio'
  CONSTRAINT phone_numbers_carrier_format CHECK (carrier ~ '^[a-z][a-z0-9_]{1,31}$');

-- The carrier that sells the claimed number, read from the signed offer when
-- the worker takes the claim.
ALTER TABLE public.onboarding_number_claim_events
  ADD COLUMN IF NOT EXISTS carrier varchar(32) NOT NULL DEFAULT 'twilio'
  CONSTRAINT onboarding_number_claim_events_carrier_format CHECK (carrier ~ '^[a-z][a-z0-9_]{1,31}$');

-- Only texts and phone calls have a carrier. Website chats, Instagram
-- messages and browser calls keep null.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS carrier varchar(32)
  CONSTRAINT messages_carrier_format CHECK (carrier IS NULL OR carrier ~ '^[a-z][a-z0-9_]{1,31}$');

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS carrier varchar(32)
  CONSTRAINT calls_carrier_format CHECK (carrier IS NULL OR carrier ~ '^[a-z][a-z0-9_]{1,31}$');

UPDATE public.messages SET carrier = 'twilio' WHERE channel = 'sms' AND carrier IS NULL;
UPDATE public.calls SET carrier = 'twilio' WHERE transport = 'voice' AND carrier IS NULL;
