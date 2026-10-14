-- At boot the worker queued a summary job and a re-embed job for every
-- business on the bulk queue, where uploads waited behind them. These
-- listings return only the businesses those jobs would change. The dispatcher
-- can't read profiles or knowledge, so each returns business ids and nothing
-- else.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Businesses that still have the sign-up placeholder summary and some
-- knowledge to write one from: an active text entry or an indexed document.
CREATE OR REPLACE FUNCTION app.list_summary_backfill_businesses()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT p.business_id
  FROM public.receptionist_profiles p
  WHERE p.summary_source = 'placeholder'
    AND (
      EXISTS (SELECT 1 FROM public.knowledge_snippets s WHERE s.business_id = p.business_id AND s.active)
      OR EXISTS (SELECT 1 FROM public.knowledge_documents d WHERE d.business_id = p.business_id AND d.active AND d.status = 'indexed')
    )
    AND session_user = 'lobbystack_dispatcher'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'dispatcher'
$$;

REVOKE ALL ON FUNCTION app.list_summary_backfill_businesses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_summary_backfill_businesses() TO lobbystack_dispatcher;

-- Businesses with a chunk the re-embed job would pick up: embedded with
-- another model, not embedded, or pending or failed. Each test reads an index
-- per business (knowledge_chunks_business_embedding_fingerprint_idx, and the
-- small partial index 0100 adds), so a worker start doesn't scan every chunk.
CREATE OR REPLACE FUNCTION app.list_reembed_businesses(p_fingerprint text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT b.id
  FROM public.businesses b
  WHERE (
      EXISTS (
        SELECT 1 FROM public.knowledge_chunks c
        WHERE c.business_id = b.id
          AND (c.embedding_fingerprint < p_fingerprint OR c.embedding_fingerprint > p_fingerprint OR c.embedding_fingerprint IS NULL)
      )
      OR EXISTS (
        SELECT 1 FROM public.knowledge_chunks c
        WHERE c.business_id = b.id
          AND (c.embedding IS NULL OR c.embedding_status IN ('pending', 'failed'))
      )
    )
    AND session_user = 'lobbystack_dispatcher'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'dispatcher'
$$;

REVOKE ALL ON FUNCTION app.list_reembed_businesses(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_reembed_businesses(text) TO lobbystack_dispatcher;
