ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS billing_excluded boolean NOT NULL DEFAULT false;
