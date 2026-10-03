-- Instant booking needs opening hours, and most new businesses never set
-- them, so every time looked taken. The worker now fills the hours with AI
-- from the business's knowledge sources when they state them. hours_source
-- records who set the hours, so hours a person set are never replaced:
--   none: no hours set yet
--   generated: filled in by AI from the knowledge sources
--   operator: set by a person, in the dashboard or the API
-- hours_fingerprint identifies the knowledge the worker last read for hours,
-- so it skips the model when nothing changed, whether or not it found hours.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS hours_source varchar(16) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS hours_fingerprint varchar(64),
  ADD COLUMN IF NOT EXISTS hours_generated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_hours_source_check') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_hours_source_check CHECK (hours_source IN ('none', 'generated', 'operator'));
  END IF;
END
$$;

-- A day can now have several windows, such as 9:00 to 12:00 and 13:00 to
-- 17:00 around a lunch break. Windows on a day can't share an opening time;
-- the domain checks that they don't overlap.
CREATE UNIQUE INDEX IF NOT EXISTS business_hours_business_day_open_unique
  ON public.business_hours (business_id, day_of_week, open_minutes);
DROP INDEX IF EXISTS public.business_hours_business_day_unique;

-- Every business that already has hours got them from a person: nothing else
-- wrote hours before this change. The backfill needs a role that sees every
-- row, like 0074.
DO $$
DECLARE
  marked integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE NOTICE 'Skipping the hours source backfill: % is subject to row-level security.', current_user;
    RETURN;
  END IF;

  UPDATE public.businesses business
  SET hours_source = 'operator'
  WHERE business.hours_source = 'none'
    AND EXISTS (SELECT 1 FROM public.business_hours hours WHERE hours.business_id = business.id);
  GET DIAGNOSTICS marked = ROW_COUNT;

  RAISE NOTICE 'Opening hours: % businesses marked as set by a person.', marked;
END
$$;
