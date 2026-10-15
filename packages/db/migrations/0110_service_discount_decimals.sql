-- Discounts can have up to two decimal places, such as 12.5%.
ALTER TABLE public.services
  ALTER COLUMN discount_percent TYPE numeric(5,2);
