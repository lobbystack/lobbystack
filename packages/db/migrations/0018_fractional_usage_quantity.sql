ALTER TABLE public.billing_usage_events
  ALTER COLUMN quantity TYPE double precision USING quantity::double precision;
