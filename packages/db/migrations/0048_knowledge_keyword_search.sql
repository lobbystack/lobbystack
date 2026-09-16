CREATE INDEX IF NOT EXISTS knowledge_chunks_keyword_idx
  ON public.knowledge_chunks USING gin (to_tsvector('simple', content));
CREATE INDEX IF NOT EXISTS knowledge_documents_title_keyword_idx
  ON public.knowledge_documents USING gin (to_tsvector('simple', title));
