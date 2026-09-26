-- One Google account can back the calendar integration of several businesses,
-- so an account is unique per business rather than across the whole platform.
-- The global index made a second business's connect upsert into the first
-- business's row, which RLS rejected.
--
-- Admin builds from before this change target the global index in their
-- upsert, so Google connects fail on them once it is dropped. That window is
-- the gap between this migration and the new admin build going live.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_connections_business_provider_account_unique
  ON public.calendar_connections (business_id, provider, external_account_id);

DROP INDEX IF EXISTS public.calendar_connections_provider_account_unique;
