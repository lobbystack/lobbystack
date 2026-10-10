-- The Resend delivery webhook was the only caller. It looked up a business by
-- Resend's email id, but the SMTP sender stores its own Message-ID, so nothing
-- ever matched, and the route is gone. Like the functions 0086 dropped, this
-- one skips row-level security, so drop it instead of keeping it granted.
DROP FUNCTION IF EXISTS app.resolve_business_by_email_provider_id(text);
