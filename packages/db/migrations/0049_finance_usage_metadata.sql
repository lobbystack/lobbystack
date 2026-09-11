ALTER TABLE public.unit_economics_events
  ALTER COLUMN cost_usd DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS pricing_version varchar(64),
  ADD COLUMN IF NOT EXISTS pricing_source varchar(500),
  ADD COLUMN IF NOT EXISTS pricing_effective_date varchar(10),
  ADD COLUMN IF NOT EXISTS pricing_rates jsonb,
  ADD COLUMN IF NOT EXISTS token_usage jsonb;

CREATE INDEX IF NOT EXISTS unit_economics_events_updated_idx
  ON public.unit_economics_events(updated_at, id);
CREATE INDEX IF NOT EXISTS businesses_updated_idx ON public.businesses(updated_at, id);
CREATE INDEX IF NOT EXISTS billing_accounts_updated_idx ON public.billing_accounts(updated_at, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lobbystack_finance_export') THEN
    CREATE ROLE lobbystack_finance_export NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO lobbystack_finance_export;
GRANT SELECT ON public.businesses, public.billing_accounts, public.calls,
  public.appointments, public.unit_economics_events TO lobbystack_finance_export;

DROP POLICY IF EXISTS businesses_finance_export_select ON public.businesses;
CREATE POLICY businesses_finance_export_select ON public.businesses
  FOR SELECT TO lobbystack_finance_export USING (true);
DROP POLICY IF EXISTS billing_accounts_finance_export_select ON public.billing_accounts;
CREATE POLICY billing_accounts_finance_export_select ON public.billing_accounts
  FOR SELECT TO lobbystack_finance_export USING (true);
DROP POLICY IF EXISTS calls_finance_export_select ON public.calls;
CREATE POLICY calls_finance_export_select ON public.calls
  FOR SELECT TO lobbystack_finance_export USING (true);
DROP POLICY IF EXISTS appointments_finance_export_select ON public.appointments;
CREATE POLICY appointments_finance_export_select ON public.appointments
  FOR SELECT TO lobbystack_finance_export USING (true);
DROP POLICY IF EXISTS unit_economics_events_finance_export_select ON public.unit_economics_events;
CREATE POLICY unit_economics_events_finance_export_select ON public.unit_economics_events
  FOR SELECT TO lobbystack_finance_export USING (true);
