-- The language a business's team reads what the receptionist writes for it:
-- messages, notes and requests it passes on. Null follows default_locale.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS team_locale varchar(8);
