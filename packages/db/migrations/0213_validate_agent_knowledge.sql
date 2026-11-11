-- 0208 adds these foreign keys NOT VALID. Validating them here takes only a
-- SHARE UPDATE EXCLUSIVE lock on the knowledge tables and ROW SHARE on the
-- tables they point at, so knowledge can still be written meanwhile. 0208
-- left agent_id null on every existing row and pointed website_document_id
-- only at import documents, so every row passes. A key that is already valid
-- makes this a no-op.
ALTER TABLE public.knowledge_documents VALIDATE CONSTRAINT knowledge_documents_agent_fk;
ALTER TABLE public.knowledge_documents VALIDATE CONSTRAINT knowledge_documents_website_document_fk;
ALTER TABLE public.knowledge_snippets VALIDATE CONSTRAINT knowledge_snippets_agent_fk;
