ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
