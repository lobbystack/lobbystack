SET LOCAL lock_timeout = '5s';

-- Calls created before model attribution keep NULL for the legacy model.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS live_model varchar(128);
