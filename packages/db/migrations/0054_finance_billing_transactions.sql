GRANT SELECT ON public.billing_transactions TO lobbystack_finance_export;

DROP POLICY IF EXISTS billing_transactions_finance_export_select ON public.billing_transactions;
CREATE POLICY billing_transactions_finance_export_select ON public.billing_transactions
  FOR SELECT TO lobbystack_finance_export USING (true);

CREATE INDEX IF NOT EXISTS billing_transactions_updated_idx
  ON public.billing_transactions(updated_at, id);
