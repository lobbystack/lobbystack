-- Notes an operator writes on an appointment. notes can reach the agent once
-- the caller is verified, the public API and webhooks; internal_notes are for
-- the team and never leave the dashboard. A time off's note is staff-only too.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE public.closures ADD COLUMN IF NOT EXISTS note text;
