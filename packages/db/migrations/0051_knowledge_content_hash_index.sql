-- Different source documents may contain identical text. Fingerprints support
-- indexing; they are not document identity. Keep URL uniqueness for upserts.
DROP INDEX IF EXISTS public.knowledge_documents_hash_unique;
CREATE INDEX IF NOT EXISTS knowledge_documents_hash_idx
  ON public.knowledge_documents (business_id, content_hash);
