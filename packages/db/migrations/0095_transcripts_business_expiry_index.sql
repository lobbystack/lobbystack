-- lobbystack:concurrent-index transcripts_business_expires_idx
-- The hourly privacy sweep deletes each business's expired transcript lines.
-- Without this index every run scans the whole table, once per business.
CREATE INDEX CONCURRENTLY IF NOT EXISTS transcripts_business_expires_idx
ON public.transcripts (business_id, expires_at)
WHERE expires_at IS NOT NULL;
