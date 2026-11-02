-- The link a customer joins a video appointment with, read from the booking
-- provider. Appointment texts carry it. It can change when a booking moves.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS video_url text;
