-- Legacy trust exemption: these customers proved control of their account
-- through the phone-verification onboarding flow, not through mailbox access.
-- Preserve their existing access during the email-verification rollout. Code
-- interpreting email_verified must account for this grandfathered population.
UPDATE public.users
SET email_verified = true,
    updated_at = now()
WHERE phone_verified_at IS NOT NULL
  AND email_verified = false;
