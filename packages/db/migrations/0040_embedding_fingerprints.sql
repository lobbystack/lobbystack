-- Track the embedding coordinate space for safe provider/model migrations.

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_fingerprint varchar(64);

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_status varchar(16);

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_error text;

UPDATE public.knowledge_chunks
SET embedding_status = CASE WHEN embedding_fingerprint IS NULL THEN 'pending' ELSE 'completed' END
WHERE embedding_status IS NULL;

ALTER TABLE public.knowledge_chunks
  ALTER COLUMN embedding_status SET DEFAULT 'pending',
  ALTER COLUMN embedding_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS knowledge_chunks_business_embedding_fingerprint_idx
  ON public.knowledge_chunks (business_id, embedding_fingerprint);
