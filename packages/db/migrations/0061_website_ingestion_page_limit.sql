ALTER TABLE public.website_ingestion_jobs
  ADD COLUMN IF NOT EXISTS page_limit integer;

COMMENT ON COLUMN public.website_ingestion_jobs.page_limit IS
  'Page cap the crawl ran with; distinguishes an onboarding sample from a full read.';

-- A crawl that was sampled recorded its cap in the job it enqueued, so take the
-- cap from the newest crawl message for each ingestion where one survives.
UPDATE public.website_ingestion_jobs AS job
SET page_limit = latest.page_limit
FROM (
  SELECT DISTINCT ON (message.payload->>'websiteIngestionJobId')
    message.payload->>'websiteIngestionJobId' AS job_id,
    (message.payload->>'limit')::integer AS page_limit
  FROM public.outbox_messages AS message
  WHERE message.topic = 'knowledge.crawlWebsite'
    AND message.payload->>'limit' ~ '^[0-9]+$'
  ORDER BY message.payload->>'websiteIngestionJobId', message.created_at DESC
) AS latest
WHERE job.page_limit IS NULL
  AND job.id::text = latest.job_id;

-- Every other crawl ran before onboarding started sampling, so it read the
-- whole site. Leaving these null would reopen the guide step for them.
UPDATE public.website_ingestion_jobs
SET page_limit = 50
WHERE page_limit IS NULL;
