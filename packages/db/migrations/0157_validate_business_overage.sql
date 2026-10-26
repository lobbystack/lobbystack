-- 0155 and 0156 add these checks NOT VALID. Validating them here takes only
-- a SHARE UPDATE EXCLUSIVE lock, so billing accounts and usage events can
-- still be written meanwhile. Every row the earlier files added a column to
-- holds its default, which passes. A check that is already valid makes this
-- a no-op.
ALTER TABLE public.billing_accounts VALIDATE CONSTRAINT billing_accounts_overage_rates_check;
ALTER TABLE public.billing_accounts VALIDATE CONSTRAINT billing_accounts_overage_currency_check;
ALTER TABLE public.billing_usage_events VALIDATE CONSTRAINT billing_usage_events_stripe_overage_reports_check;
