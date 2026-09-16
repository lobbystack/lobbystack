ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_price double precision,
  ADD COLUMN IF NOT EXISTS provider_price_unit varchar(16),
  ADD COLUMN IF NOT EXISTS provider_cost_usd double precision,
  ADD COLUMN IF NOT EXISTS provider_num_segments integer;

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_price double precision,
  ADD COLUMN IF NOT EXISTS provider_price_unit varchar(16),
  ADD COLUMN IF NOT EXISTS provider_cost_usd double precision;
