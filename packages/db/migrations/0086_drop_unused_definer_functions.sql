-- Nothing calls these SECURITY DEFINER functions any more. Each one skips
-- row-level security, so drop them instead of keeping them granted to the
-- runtime roles. The phone verification ones served the personal phone step
-- that 0059 removed from onboarding.
DROP FUNCTION IF EXISTS app.resolve_business_by_call(text);
DROP FUNCTION IF EXISTS app.resolve_business_by_call_id(uuid);
DROP FUNCTION IF EXISTS app.resolve_business_by_gateway_session(text);
DROP FUNCTION IF EXISTS app.claim_phone_verification_check(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS app.record_phone_verification_check_failure(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS app.reuse_verified_phone_for_business(uuid, uuid);
DROP FUNCTION IF EXISTS app.resolve_verified_phone_country(uuid, uuid);
DROP FUNCTION IF EXISTS app.resolve_verified_phone_market(uuid, uuid);
