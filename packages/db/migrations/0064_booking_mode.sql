-- How the agent handles appointments: book directly, take a request for the
-- team to confirm, or not book at all. Existing businesses keep booking directly.
ALTER TABLE public.receptionist_profiles
  ADD COLUMN IF NOT EXISTS booking_mode varchar(16) NOT NULL DEFAULT 'instant';

ALTER TABLE public.receptionist_profiles
  DROP CONSTRAINT IF EXISTS receptionist_profiles_booking_mode_check;
ALTER TABLE public.receptionist_profiles
  ADD CONSTRAINT receptionist_profiles_booking_mode_check CHECK (booking_mode IN ('off', 'request', 'instant'));
