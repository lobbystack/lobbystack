-- The GPT-Live voice the receptionist speaks in on phone and browser calls.
-- Existing businesses keep marin, the voice every call used before.
--
-- No check constraint: OpenAI adds and retires voices, and the app checks the
-- value against its list when it's saved. Calls read an unknown stored voice
-- as marin.
ALTER TABLE public.receptionist_profiles
  ADD COLUMN IF NOT EXISTS voice varchar(32) NOT NULL DEFAULT 'marin';
