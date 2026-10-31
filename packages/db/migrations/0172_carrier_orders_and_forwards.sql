-- A carrier order that outlasts the worker's wait, such as a Telnyx order
-- under requirement review, keeps its id on the claim, so the next attempt
-- checks that order instead of placing a new one.
ALTER TABLE public.onboarding_number_claim_events
  ADD COLUMN IF NOT EXISTS provider_order_id varchar(255);

-- The number a carrier that forwards refused calls itself (Telnyx) was last
-- told to forward them to. The hourly number sweep compares it with what the
-- fallback would answer now, so a new owner phone reaches the carrier too.
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS refused_calls_forward_to varchar(32);
