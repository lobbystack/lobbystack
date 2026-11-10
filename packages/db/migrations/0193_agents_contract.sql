-- A business can have several agents, one of them its default (ADR 0012).
-- This needs 0192's release live first: since then no code upserts on
-- business_id, reads receptionist_profiles, or inserts an agent without
-- is_default, so the view, its name trigger and the one-agent index can go.
-- agents holds about one row per business, so the index builds under the
-- brief lock this file takes anyway.
SET LOCAL lock_timeout = '5s';

DROP VIEW IF EXISTS public.receptionist_profiles;

-- Every insert names its agent now.
DROP TRIGGER IF EXISTS agents_localize_default_name ON public.agents;
DROP FUNCTION IF EXISTS app.localize_default_agent_name();

-- One default per business, built before the old index goes, so no moment
-- allows two.
CREATE UNIQUE INDEX IF NOT EXISTS agents_one_default_per_business ON public.agents (business_id) WHERE is_default;
DROP INDEX IF EXISTS public.agents_business_unique;

-- A second agent isn't the default unless someone makes it one.
ALTER TABLE public.agents ALTER COLUMN is_default SET DEFAULT false;
