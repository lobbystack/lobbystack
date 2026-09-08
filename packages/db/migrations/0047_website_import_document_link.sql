ALTER TABLE public.website_ingestion_jobs ADD COLUMN IF NOT EXISTS root_document_id uuid REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS website_jobs_root_document_idx ON public.website_ingestion_jobs(root_document_id);
