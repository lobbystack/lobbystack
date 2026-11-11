-- lobbystack:concurrent-index knowledge_documents_website_document_idx
-- A website's pages are found through website_document_id (0208), and
-- deleting a website sets it null on them. Built concurrently, so
-- knowledge_documents takes writes while it builds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_documents_website_document_idx
ON public.knowledge_documents (website_document_id) WHERE website_document_id IS NOT NULL;
