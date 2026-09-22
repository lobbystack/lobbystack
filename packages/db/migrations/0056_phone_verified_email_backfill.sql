-- Existing customers already proved control of their account through the
-- phone-verification onboarding flow. Do not force those customers through a
-- second verification gate after email verification becomes mandatory.
UPDATE public.users
SET email_verified = true,
    updated_at = now()
WHERE phone_verified_at IS NOT NULL
  AND email_verified = false;
