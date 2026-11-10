-- The facts an alert email lays out beyond its subject and body, such as the
-- caller, time and length of the call a call summary describes. The privacy
-- sweep clears them with the rest of the alert's content.
ALTER TABLE public.operator_notification_deliveries ADD COLUMN IF NOT EXISTS details jsonb;

-- Recipients now carry their dashboard language, so an alert email with
-- details can be written in it.
DROP FUNCTION IF EXISTS app.resolve_operator_notification_recipients(uuid);

CREATE FUNCTION app.resolve_operator_notification_recipients(target_business_id uuid)
RETURNS TABLE(
  user_id uuid,
  email text,
  phone text,
  event_preferences jsonb,
  email_enabled boolean,
  sms_enabled boolean,
  daily_summary_enabled boolean,
  daily_summary_send_time varchar(5),
  sms_consent_granted_at timestamptz,
  sms_consent_revoked_at timestamptz,
  sms_consent_disclosure_version varchar(64),
  sms_consent_phone varchar(32),
  preferred_locale varchar(8)
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app, pg_catalog
AS $$
  SELECT u.id, u.email, u.phone, p.event_preferences,
    COALESCE(p.email_enabled, true), COALESCE(p.sms_enabled, false),
    COALESCE(p.daily_summary_enabled, false), p.daily_summary_send_time,
    p.sms_consent_granted_at, p.sms_consent_revoked_at, p.sms_consent_disclosure_version, p.sms_consent_phone,
    u.preferred_locale
  FROM public.business_memberships m
  JOIN public.users u ON u.id = m.user_id
  LEFT JOIN public.operator_notification_preferences p ON p.business_id = m.business_id AND p.user_id = m.user_id
  WHERE session_user = 'lobbystack_worker'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'worker'
    AND target_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
    AND m.business_id = target_business_id AND m.status = 'active'
$$;

REVOKE ALL ON FUNCTION app.resolve_operator_notification_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_operator_notification_recipients(uuid) TO lobbystack_worker;
