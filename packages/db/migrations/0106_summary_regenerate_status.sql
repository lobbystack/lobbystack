-- The outcome of the last "Rewrite with AI", so the dashboard can tell the
-- operator when the rewrite finished. Null when no rewrite was asked for:
--   pending: queued or running
--   completed: AI wrote a new summary
--   empty: the knowledge doesn't say what the business does, so nothing changed
--   failed: the rewrite errored
ALTER TABLE public.receptionist_profiles
  ADD COLUMN IF NOT EXISTS summary_regenerate_status varchar(16);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receptionist_profiles_summary_regenerate_status_check') THEN
    ALTER TABLE public.receptionist_profiles
      ADD CONSTRAINT receptionist_profiles_summary_regenerate_status_check CHECK (summary_regenerate_status IN ('pending', 'completed', 'empty', 'failed'));
  END IF;
END
$$;
