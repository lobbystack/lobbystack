-- The call a caller verified an appointment change on. A keypad PIN accepted
-- on a call counts only on that call, so a later call from the same number,
-- which a spoofed caller ID can make, has to type the PIN again.
ALTER TABLE public.appointment_change_verifications ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL;
