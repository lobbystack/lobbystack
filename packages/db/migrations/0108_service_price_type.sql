-- How a service is priced: fixed (price_minor), from (a starting price in
-- price_minor), range (price_minor to price_max_minor), or in_person (the
-- business sets it once it knows the customer, so no amount). Replaces the
-- price_is_from flag from 0105.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS price_type varchar(16) NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS price_max_minor bigint;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'price_is_from') THEN
    UPDATE public.services SET price_type = 'from' WHERE price_is_from;
    ALTER TABLE public.services DROP COLUMN price_is_from;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_price_type_check') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_price_type_check CHECK (price_type IN ('fixed', 'from', 'range', 'in_person'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_price_max_minor_check') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_price_max_minor_check CHECK (price_max_minor IS NULL OR price_max_minor >= 0);
  END IF;
END
$$;
