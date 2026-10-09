-- A GPT-Live phone call's provider ID is its OpenAI session. Twilio's trunk
-- names the same call with its own SID in the X-Twilio-CallSid header of the
-- INVITE, which is saved here so the call can be found in Twilio's console and
-- logs.
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS twilio_call_sid varchar(64);
