-- A call's summary often quotes the caller, so the privacy sweep now clears it
-- when it deletes the call's transcript. Earlier sweeps deleted transcripts
-- without touching summaries, and the sweep never selects those calls again.
-- Clear them here the way the sweep does: a message-taking session keeps its
-- kind, any other loses its summary, and a conversation's summary is cleared
-- only while it still holds that call's text.
--
-- A call keeps its transcript lines until its retention ends, and retention is
-- at least a day: CONTENT_RETENTION_POLICY_JSON can shorten a paid plan's to
-- that. So a call that started more than a day ago and has no lines left lost
-- them to retention; no plan lookup is needed. Running this file again changes
-- nothing.
--
-- The backfill needs a role that sees every row, like 0088.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  cleared_conversations integer;
  cleared_sessions integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE NOTICE 'Skipping the expired call summary cleanup: % is subject to row-level security.', current_user;
    RETURN;
  END IF;

  -- One statement, so the conversation update still sees each session's text.
  WITH expired AS (
    SELECT s.id, s.business_id, s.conversation_id, s.summary->>'summary' AS summary_text
    FROM public.conversation_sessions s
    JOIN public.calls c ON c.id = s.call_id AND c.business_id = s.business_id
    WHERE s.summary_kind IN ('summary', 'message_taking')
      AND jsonb_typeof(s.summary->'summary') = 'string'
      AND c.started_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM public.transcripts t WHERE t.call_id = s.call_id)
  ),
  conversations_cleared AS (
    UPDATE public.conversations conv
    SET summary = NULL, updated_at = now()
    FROM expired e
    WHERE conv.id = e.conversation_id
      AND conv.business_id = e.business_id
      AND conv.summary = e.summary_text
    RETURNING conv.id
  ),
  sessions_cleared AS (
    UPDATE public.conversation_sessions s
    SET summary = CASE WHEN s.summary->>'kind' = 'message_taking' THEN '{"kind":"message_taking"}'::jsonb END,
        summary_kind = CASE WHEN s.summary->>'kind' = 'message_taking' THEN s.summary_kind END,
        updated_at = now()
    FROM expired e
    WHERE s.id = e.id
    RETURNING s.id
  )
  SELECT (SELECT count(*) FROM sessions_cleared), (SELECT count(*) FROM conversations_cleared)
  INTO cleared_sessions, cleared_conversations;

  RAISE NOTICE 'Expired calls: % session and % conversation summaries cleared.', cleared_sessions, cleared_conversations;
END
$$;
