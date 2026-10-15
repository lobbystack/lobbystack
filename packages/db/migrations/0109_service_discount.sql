-- A discount on a service's price, as a whole percentage from 0 (none) to
-- 100. A price set in person has no amount, so it keeps 0.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS discount_percent integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_discount_percent_check') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_discount_percent_check CHECK (discount_percent BETWEEN 0 AND 100);
  END IF;
END
$$;
