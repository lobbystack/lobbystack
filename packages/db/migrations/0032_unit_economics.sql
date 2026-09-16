CREATE TABLE IF NOT EXISTS public.unit_economics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  month_key varchar(16) NOT NULL,
  occurred_at timestamptz NOT NULL,
  event_key varchar(255) NOT NULL,
  event_kind varchar(64) NOT NULL,
  channel varchar(32) NOT NULL,
  cost_usd double precision NOT NULL,
  quantity double precision,
  quantity_unit varchar(32),
  provider varchar(64),
  model varchar(160),
  operation varchar(160),
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  operator_notification_delivery_id uuid REFERENCES public.operator_notification_deliveries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.unit_economics_events DROP CONSTRAINT IF EXISTS unit_economics_events_event_key_key;
DROP INDEX IF EXISTS public.unit_economics_events_event_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS unit_economics_events_business_event_key_unique ON public.unit_economics_events(business_id, event_key);
CREATE INDEX IF NOT EXISTS unit_economics_events_business_month_idx ON public.unit_economics_events(business_id, month_key, occurred_at);
CREATE INDEX IF NOT EXISTS unit_economics_events_kind_idx ON public.unit_economics_events(business_id, event_kind, occurred_at);

CREATE TABLE IF NOT EXISTS public.unit_economics_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  month_key varchar(16) NOT NULL,
  total_cost_usd double precision NOT NULL DEFAULT 0,
  provider_cost_usd double precision NOT NULL DEFAULT 0,
  ai_cost_usd double precision NOT NULL DEFAULT 0,
  infra_cost_usd double precision NOT NULL DEFAULT 0,
  voice_cost_usd double precision NOT NULL DEFAULT 0,
  sms_cost_usd double precision NOT NULL DEFAULT 0,
  alert_sms_cost_usd double precision NOT NULL DEFAULT 0,
  voice_call_count integer NOT NULL DEFAULT 0,
  voice_minutes double precision NOT NULL DEFAULT 0,
  outbound_sms_count integer NOT NULL DEFAULT 0,
  sms_thread_count integer NOT NULL DEFAULT 0,
  active_user_count integer NOT NULL DEFAULT 0,
  cost_per_voice_call_usd double precision NOT NULL DEFAULT 0,
  cost_per_voice_minute_usd double precision NOT NULL DEFAULT 0,
  cost_per_outbound_sms_usd double precision NOT NULL DEFAULT 0,
  cost_per_sms_thread_usd double precision NOT NULL DEFAULT 0,
  cost_per_active_user_usd double precision NOT NULL DEFAULT 0,
  cost_per_business_usd double precision NOT NULL DEFAULT 0,
  recomputed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, month_key)
);
CREATE INDEX IF NOT EXISTS unit_economics_rollups_month_idx ON public.unit_economics_rollups(month_key);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['unit_economics_events', 'unit_economics_rollups'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON public.%I USING (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id))) WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id)))',
      table_name, table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_app, lobbystack_worker', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO lobbystack_readonly', table_name);
  END LOOP;
END
$$;
