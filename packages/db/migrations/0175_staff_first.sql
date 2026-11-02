-- Staff answers first: a call rings one staff phone before the receptionist
-- answers. Off by default, so existing numbers stay on the receptionist.
ALTER TABLE public.receptionist_profiles
  ADD COLUMN IF NOT EXISTS staff_first_mode varchar(16) NOT NULL DEFAULT 'never',
  ADD COLUMN IF NOT EXISTS staff_first_number text,
  ADD COLUMN IF NOT EXISTS staff_first_ring_seconds smallint NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS staff_first_message text,
  ADD COLUMN IF NOT EXISTS staff_first_handover_message text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receptionist_profiles_staff_first_mode_check') THEN
    ALTER TABLE public.receptionist_profiles ADD CONSTRAINT receptionist_profiles_staff_first_mode_check CHECK (staff_first_mode IN ('never', 'business_hours', 'always'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receptionist_profiles_staff_first_ring_seconds_check') THEN
    ALTER TABLE public.receptionist_profiles ADD CONSTRAINT receptionist_profiles_staff_first_ring_seconds_check CHECK (staff_first_ring_seconds IN (10, 15, 20, 30, 45, 60));
  END IF;
END $$;
