ALTER TABLE IF EXISTS public.knowledge_chunks
  ALTER COLUMN embedding TYPE vector(1536)
  USING embedding::vector;

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx
  ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
