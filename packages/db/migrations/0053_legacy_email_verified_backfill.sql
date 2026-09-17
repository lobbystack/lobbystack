-- The importer marks a legacy account unverified when its source row has no
-- emailVerificationTime. Those customers signed in without email verification
-- before cutover, and production keeps REQUIRE_EMAIL_VERIFICATION enabled, so
-- they could not sign in afterward. Mark imported accounts verified; the
-- legacy_convex_id guard skips accounts created on the new platform, and the
-- email_verified guard keeps this statement idempotent.
UPDATE public.users
SET email_verified = true,
    updated_at = now()
WHERE legacy_convex_id IS NOT NULL
  AND email_verified = false;
