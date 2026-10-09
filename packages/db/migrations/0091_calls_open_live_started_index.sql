-- lobbystack:concurrent-index calls_open_live_started_idx
-- Holds only open GPT-Live calls, so the recovery listing stays small as calls grow.
CREATE INDEX CONCURRENTLY IF NOT EXISTS calls_open_live_started_idx
ON public.calls (started_at)
WHERE ended_at IS NULL AND provider = 'openai_live';
