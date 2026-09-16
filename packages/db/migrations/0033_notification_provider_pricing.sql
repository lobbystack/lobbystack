ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS provider_price double precision,
  ADD COLUMN IF NOT EXISTS provider_price_unit varchar(16),
  ADD COLUMN IF NOT EXISTS provider_cost_usd double precision,
  ADD COLUMN IF NOT EXISTS provider_num_segments integer;

ALTER TABLE public.operator_notification_deliveries
  ADD COLUMN IF NOT EXISTS provider_price double precision,
  ADD COLUMN IF NOT EXISTS provider_price_unit varchar(16),
  ADD COLUMN IF NOT EXISTS provider_cost_usd double precision,
  ADD COLUMN IF NOT EXISTS provider_num_segments integer;
