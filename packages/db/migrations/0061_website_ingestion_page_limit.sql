ALTER TABLE public.website_ingestion_jobs
  ADD COLUMN IF NOT EXISTS page_limit integer;

COMMENT ON COLUMN public.website_ingestion_jobs.page_limit IS
  'Page cap the crawl ran with; distinguishes an onboarding sample from a full read.';

-- Every crawl that already exists ran before onboarding started sampling, so it
-- read the whole site. Leaving these null would reopen the guide step for them.
UPDATE public.website_ingestion_jobs
SET page_limit = 50
WHERE page_limit IS NULL;
