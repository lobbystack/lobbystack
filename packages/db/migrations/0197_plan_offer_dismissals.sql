-- The plans open by themselves after the operator tests the agent. A person
-- who keeps closing them without choosing needs a longer pause, so count the
-- dismissals in a row.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS plan_offer_dismissals integer NOT NULL DEFAULT 0;
