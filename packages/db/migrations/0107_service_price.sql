-- Service prices. Each business charges in one currency (ISO 4217 code). A
-- service's price is a whole number of that currency's ISO minor unit: cents
-- for USD and EUR, hundredths for RSD, whole yen for JPY (see
-- currencyFractionDigits in @lobbystack/shared). price_type says how to read it:
-- fixed (price_minor), from (a starting price in price_minor), range
-- (price_minor to price_max_minor), or in_person (the business sets it once it
-- knows the customer, so no amount). Null means no price is set.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'USD';

-- Existing businesses get their country's currency from the timezone they chose.
UPDATE public.businesses SET currency = CASE
  WHEN timezone = 'Europe/Belgrade' THEN 'RSD'
  WHEN timezone = 'Europe/London' THEN 'GBP'
  WHEN timezone IN ('Europe/Zurich') THEN 'CHF'
  WHEN timezone IN ('Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Lisbon', 'Europe/Dublin', 'Europe/Athens', 'Europe/Helsinki', 'Europe/Ljubljana', 'Europe/Zagreb', 'Europe/Podgorica', 'Europe/Luxembourg', 'Europe/Bratislava', 'Europe/Tallinn', 'Europe/Riga', 'Europe/Vilnius', 'Europe/Malta', 'Atlantic/Canary') THEN 'EUR'
  WHEN timezone IN ('America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/Regina', 'America/Montreal') THEN 'CAD'
  WHEN timezone = 'America/Mexico_City' THEN 'MXN'
  WHEN timezone LIKE 'Australia/%' THEN 'AUD'
  ELSE currency
END
WHERE currency = 'USD';

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS price_minor bigint,
  ADD COLUMN IF NOT EXISTS price_max_minor bigint,
  ADD COLUMN IF NOT EXISTS price_type varchar(16) NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_currency_check') THEN
    ALTER TABLE public.businesses ADD CONSTRAINT businesses_currency_check CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_price_minor_check') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_price_minor_check CHECK (price_minor IS NULL OR price_minor >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_price_max_minor_check') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_price_max_minor_check CHECK (price_max_minor IS NULL OR price_max_minor >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_price_type_check') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_price_type_check CHECK (price_type IN ('fixed', 'from', 'range', 'in_person'));
  END IF;
END
$$;
