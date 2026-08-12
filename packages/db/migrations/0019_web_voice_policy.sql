ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS origin_url text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS widget_id varchar(128),
  ADD COLUMN IF NOT EXISTS session_purpose varchar(32),
  ADD COLUMN IF NOT EXISTS prospect_demo_id uuid,
  ADD COLUMN IF NOT EXISTS web_call_max_duration_ms integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_prospect_demo_id_prospect_demos_id_fk'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_prospect_demo_id_prospect_demos_id_fk
      FOREIGN KEY (prospect_demo_id) REFERENCES public.prospect_demos(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS calls_prospect_demo_idx ON public.calls(prospect_demo_id, started_at);
