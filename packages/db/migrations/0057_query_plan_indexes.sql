-- Phase 9 query-plan validation added these indexes from local EXPLAIN (ANALYZE,
-- BUFFERS) evidence at 10k-50k rows per table under the real app/worker RLS
-- context. Each one removes a repeatable scan-buffer or plan regression for a
-- production predicate:
--
--   appointments_business_created_idx          dashboard period counts (created_at)
--   calls_business_recording_idx               retention recording sweep join
--   storage_objects_business_retention_idx     retained-object sweep
--   storage_objects_recording_retention_idx    recording sweep storage side
--   calendar_busy_blocks_connection_start_idx  booking availability busy lookup
--
-- The migration loader applies a file as a single simple query, so a file cannot
-- carry several CREATE INDEX CONCURRENTLY statements. These builds are
-- transactional with a bounded lock/statement window, matching the 0048
-- precedent. Where a transactional build cannot meet the production lock window,
-- split that index into its own 00NN file with `-- lobbystack:concurrent-index`
-- and let the loader build it outside a transaction.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE INDEX IF NOT EXISTS appointments_business_created_idx
  ON public.appointments (business_id, created_at);

CREATE INDEX IF NOT EXISTS calls_business_recording_idx
  ON public.calls (business_id, recording_object_id)
  WHERE recording_object_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS storage_objects_business_retention_idx
  ON public.storage_objects (business_id, retention_until)
  WHERE retention_until IS NOT NULL AND purpose <> 'recording';

CREATE INDEX IF NOT EXISTS storage_objects_recording_retention_idx
  ON public.storage_objects (business_id, retention_until, id)
  WHERE purpose = 'recording' AND status = 'ready' AND retention_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendar_busy_blocks_connection_start_idx
  ON public.calendar_busy_blocks (connection_id, starts_at);
