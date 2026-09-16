ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS billing_interval varchar(16),
  ADD COLUMN IF NOT EXISTS overage_spending_cap_cents integer;

ALTER TABLE public.billing_usage_events
  ADD COLUMN IF NOT EXISTS billable_quantity double precision,
  ADD COLUMN IF NOT EXISTS plan_at_record_time varchar(32),
  ADD COLUMN IF NOT EXISTS billing_interval_at_record_time varchar(16),
  ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS legacy_convex_id text;
CREATE UNIQUE INDEX IF NOT EXISTS billing_usage_events_legacy_convex_id_unique ON public.billing_usage_events(legacy_convex_id);

CREATE TABLE IF NOT EXISTS public.billing_usage_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  period_key varchar(16) NOT NULL,
  plan_at_snapshot varchar(32),
  voice_seconds_used double precision NOT NULL DEFAULT 0,
  alert_sms_segments_used double precision NOT NULL DEFAULT 0,
  outbound_call_attempts_used double precision NOT NULL DEFAULT 0,
  voice_blocked boolean NOT NULL DEFAULT false,
  alert_sms_blocked boolean NOT NULL DEFAULT false,
  outbound_call_attempts_blocked boolean NOT NULL DEFAULT false,
  overage_spend_cents integer NOT NULL DEFAULT 0,
  last_recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, period_key)
);
CREATE INDEX IF NOT EXISTS billing_usage_months_business_idx ON public.billing_usage_months(business_id, last_recorded_at);

ALTER TABLE public.billing_usage_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage_months FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_usage_months_tenant_isolation ON public.billing_usage_months;
CREATE POLICY billing_usage_months_tenant_isolation ON public.billing_usage_months
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_usage_months TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.billing_usage_months TO lobbystack_readonly;
