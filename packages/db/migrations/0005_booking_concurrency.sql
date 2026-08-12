CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE IF EXISTS public.appointments
  DROP CONSTRAINT IF EXISTS appointments_staff_no_overlap;

ALTER TABLE IF EXISTS public.appointments
  ADD CONSTRAINT appointments_staff_no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('confirmed', 'pending', 'syncing'));
