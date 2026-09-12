-- Twilio may reuse a verification SID for repeated sends to the same phone.
-- Local attempt IDs remain unique and all checks retain business/user scoping.
ALTER TABLE public.onboarding_phone_verifications
  DROP CONSTRAINT IF EXISTS onboarding_phone_verifications_provider_verification_id_key;
DROP INDEX IF EXISTS public.onboarding_phone_verifications_provider_unique;
CREATE INDEX IF NOT EXISTS onboarding_phone_verifications_provider_idx
  ON public.onboarding_phone_verifications(provider_verification_id);
