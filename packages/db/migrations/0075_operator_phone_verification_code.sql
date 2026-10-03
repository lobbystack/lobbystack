-- Operators verify the phone that receives SMS alerts from notification
-- settings. The worker generates the code and texts it from the alert SMS
-- sender, so only a keyed hash of the code is stored. The hash is cleared once
-- the attempt is approved, fails, or is canceled.
ALTER TABLE public.onboarding_phone_verifications ADD COLUMN IF NOT EXISTS code_hash text;
