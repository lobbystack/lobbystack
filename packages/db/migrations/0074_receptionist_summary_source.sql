-- The business summary tells GPT-Live and the agent what the business does.
-- New businesses start with a placeholder, and the worker now writes a summary
-- with AI from the business's knowledge. summary_source records who wrote it,
-- so a summary an operator wrote is never replaced automatically:
--   placeholder: the default written at sign-up
--   generated: written by AI from the knowledge sources
--   operator: written or edited by a person, in the dashboard or the API
-- summary_fingerprint identifies the knowledge a generated summary came from,
-- so the worker skips regenerating when nothing changed.

ALTER TABLE public.receptionist_profiles
  ADD COLUMN IF NOT EXISTS summary_source varchar(16) NOT NULL DEFAULT 'placeholder',
  ADD COLUMN IF NOT EXISTS summary_fingerprint varchar(64),
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receptionist_profiles_summary_source_check') THEN
    ALTER TABLE public.receptionist_profiles
      ADD CONSTRAINT receptionist_profiles_summary_source_check CHECK (summary_source IN ('placeholder', 'generated', 'operator'));
  END IF;
END
$$;

-- Existing summaries other than the sign-up defaults came from a person.
-- Defaults: "<name> uses LobbyStack to answer calls." (and the older "to handle
-- calls and SMS."), a demo's "<name> virtual receptionist", and the business
-- name the agent settings API used when it created a profile.
-- The backfill needs a role that sees every row, like 0073.
DO $$
DECLARE
  marked integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE NOTICE 'Skipping the summary source backfill: % is subject to row-level security.', current_user;
    RETURN;
  END IF;

  UPDATE public.receptionist_profiles profile
  SET summary_source = 'operator'
  FROM public.businesses business
  WHERE business.id = profile.business_id
    AND profile.summary_source = 'placeholder'
    AND btrim(profile.summary) <> ''
    AND profile.summary !~* 'uses LobbyStack to (answer calls|handle calls and SMS)\.?\s*$'
    AND profile.summary !~* 'virtual receptionist\s*$'
    AND btrim(profile.summary) <> btrim(business.name);
  GET DIAGNOSTICS marked = ROW_COUNT;

  RAISE NOTICE 'Business summaries: % marked as written by a person.', marked;
END
$$;
