-- lobbystack:concurrent-index knowledge_documents_business_agent_idx
-- Scoped retrieval (0208) filters a business's documents by agent. Built
-- concurrently, so knowledge_documents takes writes while it builds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_documents_business_agent_idx
ON public.knowledge_documents (business_id, agent_id);
