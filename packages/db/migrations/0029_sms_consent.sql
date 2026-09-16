ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS sms_consent_updated_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS sms_consent_source varchar(64);

CREATE TABLE IF NOT EXISTS public.sms_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone varchar(32) NOT NULL,
  recipient_type varchar(16) NOT NULL DEFAULT 'contact',
  action varchar(32) NOT NULL,
  source varchar(160) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_consent_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS sms_consent_events_business_idx ON public.sms_consent_events(business_id, occurred_at);
CREATE INDEX IF NOT EXISTS sms_consent_events_phone_idx ON public.sms_consent_events(phone, occurred_at);

DROP TRIGGER IF EXISTS sms_consent_events_immutable ON public.sms_consent_events;
DROP FUNCTION IF EXISTS app.prevent_sms_consent_event_mutation();

ALTER TABLE public.sms_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_consent_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_consent_events_tenant_isolation ON public.sms_consent_events;
CREATE POLICY sms_consent_events_tenant_isolation ON public.sms_consent_events
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker') OR app.has_business_membership(business_id)));
REVOKE UPDATE, DELETE ON public.sms_consent_events FROM lobbystack_app, lobbystack_worker;
GRANT SELECT, INSERT ON public.sms_consent_events TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.sms_consent_events TO lobbystack_readonly;
