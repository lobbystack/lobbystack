-- No query reads these indexes, and every insert pays to keep them current.
-- Knowledge search ranks embeddings inside a MATERIALIZED CTE, so the planner
-- never uses the HNSW index from 0004. transcripts_call_idx repeats
-- transcripts_call_sequence_unique, and knowledge_chunks_business_idx is the
-- leading column of knowledge_chunks_business_embedding_fingerprint_idx.
DROP INDEX IF EXISTS public.knowledge_chunks_embedding_hnsw_idx;
DROP INDEX IF EXISTS public.transcripts_call_idx;
DROP INDEX IF EXISTS public.knowledge_chunks_business_idx;
