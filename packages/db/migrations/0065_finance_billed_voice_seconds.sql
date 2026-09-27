-- The finance export compares what each call cost us with what the business
-- was billed for it, including short calls the business isn't charged for.
GRANT SELECT ON public.billing_usage_events TO lobbystack_finance_export;

DROP POLICY IF EXISTS billing_usage_events_finance_export_select ON public.billing_usage_events;
CREATE POLICY billing_usage_events_finance_export_select ON public.billing_usage_events
  FOR SELECT TO lobbystack_finance_export USING (true);
