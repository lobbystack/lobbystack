-- lobbystack:concurrent-index knowledge_snippets_business_agent_idx
-- Scoped retrieval (0208) filters a business's FAQs by agent. Built
-- concurrently, so knowledge_snippets takes writes while it builds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_snippets_business_agent_idx
ON public.knowledge_snippets (business_id, agent_id);
