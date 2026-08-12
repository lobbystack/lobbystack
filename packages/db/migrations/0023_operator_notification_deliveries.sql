CREATE TABLE IF NOT EXISTS public.operator_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_kind varchar(64) NOT NULL, event_key varchar(255) NOT NULL, channel varchar(16) NOT NULL CHECK (channel IN ('email', 'sms')), status varchar(32) NOT NULL DEFAULT 'pending',
  destination text NOT NULL, sender text, subject text NOT NULL, body text NOT NULL, provider_message_id text, scheduled_for timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
  content_expires_at timestamptz NOT NULL, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS operator_notification_deliveries_event_channel_unique ON public.operator_notification_deliveries(event_key, user_id, channel);
CREATE INDEX IF NOT EXISTS operator_notification_deliveries_status_schedule_idx ON public.operator_notification_deliveries(status, scheduled_for);
CREATE INDEX IF NOT EXISTS operator_notification_deliveries_business_user_idx ON public.operator_notification_deliveries(business_id, user_id);
ALTER TABLE public.operator_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_notification_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_notification_deliveries_tenant_isolation ON public.operator_notification_deliveries;
CREATE POLICY operator_notification_deliveries_tenant_isolation ON public.operator_notification_deliveries USING (business_id = app.current_business_id() AND (app.current_actor_type() = 'worker' OR (app.current_actor_type() = 'operator' AND user_id = app.current_user_id() AND app.has_business_membership(business_id)))) WITH CHECK (business_id = app.current_business_id() AND app.current_actor_type() = 'worker');
GRANT SELECT ON public.operator_notification_deliveries TO lobbystack_app, lobbystack_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_notification_deliveries TO lobbystack_worker;

CREATE OR REPLACE FUNCTION app.resolve_operator_notification_recipients(target_business_id uuid)
RETURNS TABLE(user_id uuid, email text, phone text, event_preferences jsonb, email_enabled boolean, sms_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app, pg_catalog
AS $$
  SELECT u.id, u.email, u.phone, p.event_preferences, COALESCE(p.email_enabled, true), COALESCE(p.sms_enabled, false)
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
