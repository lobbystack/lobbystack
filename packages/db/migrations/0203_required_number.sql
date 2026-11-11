-- A direct owner no longer verifies a mobile in onboarding: the number comes
-- right after the website. Direct businesses on the phone step, or on a
-- legacy stage that reads as it, move on to the number step. Partners'
-- businesses keep the phone step. normalizeOnboardingStage reads the same for
-- values old code writes during the release.
UPDATE public.businesses
  SET onboarding_stage = 'phone_number', updated_at = now()
  WHERE partner_id IS NULL
    AND onboarding_stage IN ('verify_phone', 'plan', 'verify_phone_code', 'knowledge', 'greeting', 'test_call');
