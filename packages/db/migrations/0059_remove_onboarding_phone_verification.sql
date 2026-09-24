-- Personal phone verification is no longer part of onboarding. Move any
-- workspace parked on a retired verification stage forward to plan, and cancel
-- in-flight attempts so a queued verification job can never reintroduce a
-- removed stage.
--
-- Historical data is preserved on purpose: onboarding_phone_verifications rows,
-- users.phone_verified_at, and app.resolve_verified_phone_market still back
-- number-market history, SMS eligibility, and the legacy email-verification
-- grandfathering introduced in 0056.
UPDATE public.businesses
SET onboarding_stage = 'plan',
    updated_at = now()
WHERE onboarding_stage IN ('verify_phone', 'verify_phone_code');

UPDATE public.onboarding_phone_verifications
SET status = 'canceled',
    last_error = 'Personal phone verification was retired from onboarding.',
    updated_at = now()
WHERE status IN ('queued', 'processing', 'pending');
