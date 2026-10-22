-- A percentage off every amount of a service's price, 0 for none, with up to
-- two decimal places (12.5%). A price set in person has no discount.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0;

-- Databases that ran the earlier integer version of this column.
ALTER TABLE public.services
  ALTER COLUMN discount_percent TYPE numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_discount_percent_check') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_discount_percent_check CHECK (discount_percent BETWEEN 0 AND 100);
  END IF;
END
$$;
