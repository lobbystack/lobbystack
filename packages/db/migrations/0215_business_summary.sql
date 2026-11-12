-- The summary describes the business, which every agent shares (ADR 0012), so
-- it moves from the default agent to businesses. Slice 5 left it on agents
-- while code still wrote it through the receptionist_profiles view.
--
-- The previous release still reads and writes the default agent's summary
-- columns while it drains, and new code reads and writes only businesses. So
-- until the release after this one drops the agent columns, triggers keep the
-- two in step:
--
--   * A write to a default agent's summary, which only old code makes, copies
--     to its business.
--   * A write to a business's summary copies to its default agent, so old code
--     reads what new code saved.
--   * An agent that becomes the default, or a default agent new code inserts
--     without a summary, takes the business's.
--
-- Each copy writes only what differs, and a copy made inside the other
-- trigger stops there, so neither runs twice for one change.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Migration 0215 needs a role that bypasses row-level security, and % does not.', current_user;
  END IF;
END
$$;

-- A constant default adds each column without rewriting the table.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS summary_source varchar(16) NOT NULL DEFAULT 'placeholder',
  ADD COLUMN IF NOT EXISTS summary_fingerprint varchar(64),
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_regenerate_status varchar(16);

-- New code inserts agents without a summary.
ALTER TABLE public.agents ALTER COLUMN summary SET DEFAULT '';

-- One row per business, so this runs under the brief lock the columns took.
UPDATE public.businesses business
SET summary = agent.summary,
  summary_source = agent.summary_source,
  summary_fingerprint = agent.summary_fingerprint,
  summary_generated_at = agent.summary_generated_at,
  summary_regenerate_status = agent.summary_regenerate_status
FROM public.agents agent
WHERE agent.business_id = business.id
  AND agent.is_default
  AND (business.summary, business.summary_source, business.summary_fingerprint, business.summary_generated_at, business.summary_regenerate_status)
    IS DISTINCT FROM (agent.summary, agent.summary_source, agent.summary_fingerprint, agent.summary_generated_at, agent.summary_regenerate_status);

-- businesses holds a row per business, so each check reads it under the same brief lock.
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_summary_source_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_summary_source_check CHECK (summary_source IN ('placeholder', 'generated', 'operator'));
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_summary_regenerate_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_summary_regenerate_status_check CHECK (summary_regenerate_status IN ('pending', 'completed', 'empty', 'failed'));

-- From 0183, reading the business's summary.
CREATE OR REPLACE FUNCTION app.list_summary_backfill_businesses()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT b.id
  FROM public.businesses b
  WHERE b.summary_source = 'placeholder'
    AND (
      EXISTS (SELECT 1 FROM public.knowledge_snippets s WHERE s.business_id = b.id AND s.active)
      OR EXISTS (SELECT 1 FROM public.knowledge_documents d WHERE d.business_id = b.id AND d.active AND d.status = 'indexed')
    )
    AND session_user = 'lobbystack_dispatcher'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'dispatcher'
$$;

CREATE OR REPLACE FUNCTION app.sync_agent_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_business record;
BEGIN
  IF NOT NEW.is_default THEN
    RETURN NEW;
  END IF;
  SELECT business.summary, business.summary_source, business.summary_fingerprint, business.summary_generated_at, business.summary_regenerate_status
    INTO v_business
    FROM public.businesses business WHERE business.id = NEW.business_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  -- Old code inserts a business's first agent with a summary of its own, and
  -- the business has none yet. Anything else takes the business's summary.
  IF TG_OP = 'INSERT' AND NEW.summary <> '' AND v_business.summary = '' THEN
    NULL;
  ELSIF TG_OP = 'INSERT' OR NOT OLD.is_default THEN
    NEW.summary := v_business.summary;
    NEW.summary_source := v_business.summary_source;
    NEW.summary_fingerprint := v_business.summary_fingerprint;
    NEW.summary_generated_at := v_business.summary_generated_at;
    NEW.summary_regenerate_status := v_business.summary_regenerate_status;
    RETURN NEW;
  ELSIF pg_trigger_depth() > 1 THEN
    -- The business trigger is copying its own change here.
    RETURN NEW;
  END IF;
  IF (NEW.summary, NEW.summary_source, NEW.summary_fingerprint, NEW.summary_generated_at, NEW.summary_regenerate_status)
    IS DISTINCT FROM (v_business.summary, v_business.summary_source, v_business.summary_fingerprint, v_business.summary_generated_at, v_business.summary_regenerate_status)
  THEN
    UPDATE public.businesses
    SET summary = NEW.summary,
      summary_source = NEW.summary_source,
      summary_fingerprint = NEW.summary_fingerprint,
      summary_generated_at = NEW.summary_generated_at,
      summary_regenerate_status = NEW.summary_regenerate_status
    WHERE id = NEW.business_id;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.sync_agent_summary() FROM PUBLIC;

DROP TRIGGER IF EXISTS agents_sync_summary ON public.agents;
CREATE TRIGGER agents_sync_summary
  BEFORE INSERT OR UPDATE OF summary, summary_source, summary_fingerprint, summary_generated_at, summary_regenerate_status, is_default ON public.agents
  FOR EACH ROW EXECUTE FUNCTION app.sync_agent_summary();

CREATE OR REPLACE FUNCTION app.sync_business_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- The agent trigger is copying its own change here.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  UPDATE public.agents
  SET summary = NEW.summary,
    summary_source = NEW.summary_source,
    summary_fingerprint = NEW.summary_fingerprint,
    summary_generated_at = NEW.summary_generated_at,
    summary_regenerate_status = NEW.summary_regenerate_status
  WHERE business_id = NEW.id
    AND is_default
    AND (summary, summary_source, summary_fingerprint, summary_generated_at, summary_regenerate_status)
      IS DISTINCT FROM (NEW.summary, NEW.summary_source, NEW.summary_fingerprint, NEW.summary_generated_at, NEW.summary_regenerate_status);
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION app.sync_business_summary() FROM PUBLIC;

DROP TRIGGER IF EXISTS businesses_sync_summary ON public.businesses;
CREATE TRIGGER businesses_sync_summary
  AFTER UPDATE OF summary, summary_source, summary_fingerprint, summary_generated_at, summary_regenerate_status ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION app.sync_business_summary();

-- app.default_agent_id inserted the business's name as the summary. The
-- business holds the summary now, so the agent takes it from there.
CREATE OR REPLACE FUNCTION app.default_agent_id(p_business_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  SELECT agent.id INTO v_agent_id FROM public.agents agent WHERE agent.business_id = p_business_id AND agent.is_default;
  IF v_agent_id IS NOT NULL THEN
    RETURN v_agent_id;
  END IF;
  INSERT INTO public.agents (business_id, is_default, name, greeting, tone, booking_policy, transfer_mode, appointment_change_policy)
  SELECT
    business.id,
    true,
    app.default_agent_name(business.default_locale),
    CASE lower(split_part(replace(btrim(business.default_locale), '_', '-'), '-', 1))
      WHEN 'fr' THEN format('Merci d''avoir appelé %s. Comment puis-je vous aider aujourd''hui ?', btrim(business.name))
      WHEN 'es' THEN format('Gracias por llamar a %s. ¿En qué puedo ayudarle hoy?', btrim(business.name))
      WHEN 'sr' THEN format('Hvala što ste pozvali %s. Kako mogu da vam pomognem danas?', btrim(business.name))
      WHEN 'de' THEN format('Vielen Dank für Ihren Anruf bei %s. Wie kann ich Ihnen heute helfen?', btrim(business.name))
      WHEN 'pt' THEN format('Obrigado por ligar para %s. Como posso ajudar você hoje?', btrim(business.name))
      WHEN 'it' THEN format('Grazie per aver chiamato %s. Come posso aiutarla oggi?', btrim(business.name))
      WHEN 'nl' THEN format('Bedankt voor het bellen naar %s. Waarmee kan ik u vandaag helpen?', btrim(business.name))
      ELSE format('Thanks for calling %s. How can I help you today?', btrim(business.name))
    END,
    'professional',
    'Confirm availability before booking.',
    'on_request',
    '{"enabled": true, "allowCancel": true, "allowReschedule": true, "verificationMode": "phone_match_and_facts"}'::jsonb
  FROM public.businesses business
  WHERE business.id = p_business_id
  ON CONFLICT DO NOTHING;
  SELECT agent.id INTO v_agent_id FROM public.agents agent WHERE agent.business_id = p_business_id AND agent.is_default;
  RETURN v_agent_id;
END
$$;
REVOKE ALL ON FUNCTION app.default_agent_id(uuid) FROM PUBLIC;
