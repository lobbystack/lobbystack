ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS media_started_at timestamptz;

COMMENT ON COLUMN public.calls.media_started_at IS
  'Durable start of billable web-call media; null until provider setup completes.';
