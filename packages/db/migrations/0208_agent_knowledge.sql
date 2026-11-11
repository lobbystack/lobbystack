-- Knowledge can belong to one agent, and an agent can turn shared knowledge
-- off for itself (docs/specs/agent-knowledge.md). Shared stays the default:
-- every existing row keeps agent_id null and every switch on, so answers
-- don't change for any business.
--
-- agent_id names the one agent that uses a source, or null when every agent
-- does. The foreign keys are composite, deferred and without cascade, like the
-- channel links in 0184: agents are archived, never deleted, and deleting a
-- business cascades to its agents and its knowledge in no fixed order.
--
-- A website is its import document plus the pages it brought in.
-- website_document_id links a page to that document, so a website switched off
-- covers pages a later crawl adds. source_active is the whole source's switch,
-- kept on the import document for a website; active stays each page's own.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Migration 0208 needs a role that bypasses row-level security, and % does not.', current_user;
  END IF;
END
$$;

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  ADD COLUMN IF NOT EXISTS website_document_id uuid,
  ADD COLUMN IF NOT EXISTS source_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.knowledge_snippets
  ADD COLUMN IF NOT EXISTS agent_id uuid;

-- The foreign keys go on NOT VALID, so adding them reads no existing row and
-- holds its locks only for a moment; they still check every write from now
-- on. 0213 validates them under a lock that lets writes through. The indexes
-- on these tables, which can be large, build concurrently in 0210 to 0212.
ALTER TABLE public.knowledge_documents
  DROP CONSTRAINT IF EXISTS knowledge_documents_agent_fk,
  ADD CONSTRAINT knowledge_documents_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED NOT VALID,
  DROP CONSTRAINT IF EXISTS knowledge_documents_website_document_fk,
  ADD CONSTRAINT knowledge_documents_website_document_fk FOREIGN KEY (website_document_id) REFERENCES public.knowledge_documents (id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.knowledge_snippets
  DROP CONSTRAINT IF EXISTS knowledge_snippets_agent_fk,
  ADD CONSTRAINT knowledge_snippets_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED NOT VALID;

-- Links each crawled page to the oldest website import on its host, the way
-- deleteWebsiteKnowledge groups pages today. Every row is shared before this
-- migration, so scope needs no match. An import document links to nothing.
WITH website_hosts AS (
  SELECT d.id, d.business_id, d.created_at,
    regexp_replace(lower(substring(d.source_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^@/?#]*@)?([^/?#]+)')), '^www\.', '') AS host,
    EXISTS (SELECT 1 FROM public.website_ingestion_jobs j WHERE j.root_document_id = d.id AND j.business_id = d.business_id) AS is_import
  FROM public.knowledge_documents d
  WHERE d.source_type = 'website' AND d.source_url IS NOT NULL
),
imports AS (
  SELECT DISTINCT ON (business_id, host) id, business_id, host
  FROM website_hosts
  WHERE is_import AND host IS NOT NULL
  ORDER BY business_id, host, created_at, id
)
UPDATE public.knowledge_documents page
SET website_document_id = imports.id
FROM website_hosts, imports
WHERE page.id = website_hosts.id
  AND NOT website_hosts.is_import
  AND imports.business_id = website_hosts.business_id
  AND imports.host = website_hosts.host
  AND page.website_document_id IS NULL;

-- Until the worker finishes deploying, the previous worker keeps crawling
-- website imports, and it saves every page with no agent and no website. A
-- page of an agent-only import would then be shared with every agent for
-- good. This trigger gives such a page the agent and website of the import
-- crawling its host: an import with an agent, still processing, and the only
-- kind of import on that host, since a host is in one scope only
-- (assertWebsiteScopeFree). New code always names the website, so only old
-- code fires it. The release after this one drops it.
CREATE OR REPLACE FUNCTION app.scope_crawled_page_like_its_import()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_host text := regexp_replace(lower(substring(NEW.source_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^@/?#]*@)?([^/?#]+)')), '^www\.', '');
  v_import record;
BEGIN
  IF v_host IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT d.id, d.agent_id INTO v_import
  FROM public.knowledge_documents d
  WHERE d.business_id = NEW.business_id
    AND d.source_type = 'website'
    AND d.agent_id IS NOT NULL
    AND d.status = 'processing'
    AND regexp_replace(lower(substring(d.source_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^@/?#]*@)?([^/?#]+)')), '^www\.', '') = v_host
    AND EXISTS (SELECT 1 FROM public.website_ingestion_jobs j WHERE j.root_document_id = d.id AND j.business_id = d.business_id)
  ORDER BY d.created_at, d.id
  LIMIT 1;
  IF v_import.id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.knowledge_documents d
    WHERE d.business_id = NEW.business_id
      AND d.source_type = 'website'
      AND d.agent_id IS NULL
      AND regexp_replace(lower(substring(d.source_url from '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^@/?#]*@)?([^/?#]+)')), '^www\.', '') = v_host
      AND EXISTS (SELECT 1 FROM public.website_ingestion_jobs j WHERE j.root_document_id = d.id AND j.business_id = d.business_id)
  ) THEN
    NEW.agent_id := v_import.agent_id;
    NEW.website_document_id := v_import.id;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.scope_crawled_page_like_its_import() FROM PUBLIC;

DROP TRIGGER IF EXISTS knowledge_documents_scope_crawled_page ON public.knowledge_documents;
CREATE TRIGGER knowledge_documents_scope_crawled_page
  BEFORE INSERT ON public.knowledge_documents
  FOR EACH ROW WHEN (NEW.source_type = 'website' AND NEW.agent_id IS NULL AND NEW.website_document_id IS NULL AND NEW.source_url IS NOT NULL)
  EXECUTE FUNCTION app.scope_crawled_page_like_its_import();

-- What one agent turned off. A row names a document or a snippet. Scope
-- 'source' is a whole website, file or entry; 'page' is one page of a
-- website, so turning the website back on keeps the pages turned off.
CREATE TABLE IF NOT EXISTS public.agent_knowledge_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  document_id uuid REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  snippet_id uuid REFERENCES public.knowledge_snippets(id) ON DELETE CASCADE,
  scope varchar(8) NOT NULL DEFAULT 'source' CHECK (scope IN ('source', 'page')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_knowledge_exclusions_target CHECK (num_nonnulls(document_id, snippet_id) = 1 AND (snippet_id IS NULL OR scope = 'source')),
  CONSTRAINT agent_knowledge_exclusions_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_knowledge_exclusions_document_unique ON public.agent_knowledge_exclusions (agent_id, document_id, scope) WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agent_knowledge_exclusions_snippet_unique ON public.agent_knowledge_exclusions (agent_id, snippet_id) WHERE snippet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_knowledge_exclusions_business_agent_idx ON public.agent_knowledge_exclusions (business_id, agent_id);

ALTER TABLE public.agent_knowledge_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_exclusions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_knowledge_exclusions_tenant_isolation ON public.agent_knowledge_exclusions;
CREATE POLICY agent_knowledge_exclusions_tenant_isolation ON public.agent_knowledge_exclusions
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
GRANT SELECT, INSERT, DELETE ON public.agent_knowledge_exclusions TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.agent_knowledge_exclusions TO lobbystack_readonly;
