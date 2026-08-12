CREATE TABLE IF NOT EXISTS public.operator_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  event_preferences jsonb NOT NULL,
  daily_summary_enabled boolean NOT NULL DEFAULT false,
  daily_summary_send_time varchar(5),
  sms_consent_granted_at timestamptz,
  sms_consent_revoked_at timestamptz,
  sms_consent_source varchar(64),
  sms_consent_disclosure_version varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_notification_preferences_send_time_check CHECK (daily_summary_send_time IS NULL OR daily_summary_send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE UNIQUE INDEX IF NOT EXISTS operator_notification_preferences_business_user_unique ON public.operator_notification_preferences(business_id, user_id);
CREATE INDEX IF NOT EXISTS operator_notification_preferences_user_idx ON public.operator_notification_preferences(user_id, business_id);

ALTER TABLE public.operator_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_notification_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_notification_preferences_tenant_isolation ON public.operator_notification_preferences;
CREATE POLICY operator_notification_preferences_tenant_isolation ON public.operator_notification_preferences
  USING (
    business_id = app.current_business_id()
    AND (
      app.current_actor_type() = 'worker'
      OR (app.current_actor_type() = 'operator' AND user_id = app.current_user_id() AND app.has_business_membership(business_id))
    )
  )
  WITH CHECK (
    business_id = app.current_business_id()
    AND app.current_actor_type() = 'operator'
    AND user_id = app.current_user_id()
    AND app.has_business_membership(business_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_notification_preferences TO lobbystack_app;
GRANT SELECT ON public.operator_notification_preferences TO lobbystack_worker, lobbystack_readonly;
