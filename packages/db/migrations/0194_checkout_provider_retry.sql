-- A checkout request stays processing through a provider outage. Its retry
-- window runs from the first transient failure, and retry_at tells the worker
-- when to try again without waiting out the processing lease.
ALTER TABLE public.billing_checkout_requests
  ADD COLUMN IF NOT EXISTS first_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_at timestamptz;

ALTER TABLE public.partner_checkout_requests
  ADD COLUMN IF NOT EXISTS first_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_at timestamptz;

-- The worker's update grant on this table names its columns.
GRANT UPDATE (first_failed_at, retry_at) ON public.partner_checkout_requests TO lobbystack_worker;
