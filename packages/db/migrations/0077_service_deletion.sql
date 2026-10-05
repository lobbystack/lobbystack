-- Operators can delete a service, not only disable it. Appointments keep
-- pointing at their service for history, so a deleted service stays in the
-- table with deleted_at set and active false. Every booking path already
-- reads active services only.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- A deleted service gives up its slug, so the operator can add a service
-- with the same name again.
CREATE UNIQUE INDEX IF NOT EXISTS services_business_slug_live_unique
  ON public.services (business_id, slug)
  WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS public.services_business_slug_unique;
