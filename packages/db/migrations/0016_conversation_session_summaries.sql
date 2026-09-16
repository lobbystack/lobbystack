ALTER TABLE public.conversation_sessions
  ADD COLUMN IF NOT EXISTS call_id uuid,
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS summary_kind varchar(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversation_sessions_call_id_calls_id_fk'
  ) THEN
    ALTER TABLE public.conversation_sessions
      ADD CONSTRAINT conversation_sessions_call_id_calls_id_fk
      FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_sessions_call_unique
  ON public.conversation_sessions (call_id)
  WHERE call_id IS NOT NULL;
