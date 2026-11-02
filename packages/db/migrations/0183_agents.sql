-- A business's agent is the row that was its receptionist profile (ADR 0012).
-- The table, its constraints, its index and its policy take the new name in
-- place, so every business keeps its row, and grants and row-level security
-- carry over. Each business still has one agent, its default one.
--
-- A release runs this before it deploys the worker and the admin, and the old
-- worker drains for up to 31 minutes, so old code still reads and writes
-- receptionist_profiles. That name becomes a view of the default agents below.
-- The file is safe to replay, because the journal tracks filenames and a later
-- renumbering would run it again on a database that already has it.
--
-- The summary_* columns stay on agents until slice 5 removes the view. They
-- describe the business, but a view that joined businesses for them wouldn't
-- be automatically updatable, and the old ON CONFLICT (business_id) can't run
-- on one that isn't.

SET LOCAL lock_timeout = '5s';

-- The backfills need a role that sees every row, like 0073. Other migrations
-- skip theirs on a role that can't, but this one must not leave a business
-- without an agent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Migration 0183 needs a role that bypasses row-level security, and % does not.', current_user;
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.receptionist_profiles')) = 'r' THEN
    ALTER TABLE public.receptionist_profiles RENAME TO agents;
    ALTER TABLE public.agents RENAME CONSTRAINT receptionist_profiles_pkey TO agents_pkey;
    ALTER TABLE public.agents RENAME CONSTRAINT receptionist_profiles_business_id_businesses_id_fk TO agents_business_id_businesses_id_fk;
    ALTER TABLE public.agents RENAME CONSTRAINT receptionist_profiles_booking_mode_check TO agents_booking_mode_check;
    ALTER TABLE public.agents RENAME CONSTRAINT receptionist_profiles_staff_first_mode_check TO agents_staff_first_mode_check;
    ALTER TABLE public.agents RENAME CONSTRAINT receptionist_profiles_staff_first_ring_seconds_check TO agents_staff_first_ring_seconds_check;
    ALTER TABLE public.agents RENAME CONSTRAINT receptionist_profiles_summary_regenerate_status_check TO agents_summary_regenerate_status_check;
    ALTER TABLE public.agents RENAME CONSTRAINT receptionist_profiles_summary_source_check TO agents_summary_source_check;
    -- Old code's ON CONFLICT (business_id) needs this index until the view goes.
    ALTER INDEX public.receptionist_profiles_business_unique RENAME TO agents_business_unique;
    ALTER POLICY receptionist_profiles_tenant_isolation ON public.agents RENAME TO agents_tenant_isolation;
  END IF;
END
$$;

-- Constant defaults, so these take no table rewrite, and old inserts through
-- the view fill all three. is_default stays true by default until slice 5,
-- because the view can't set it and the unique index allows one agent anyway.
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Agent',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- "Agent" in a business's language, for all eight caller languages. Callers
-- never hear it. defaultAgentName in @lobbystack/shared is the same list. A
-- tag such as pt-BR counts as its language, and any other value as English,
-- as normalizeRuntimeLocale does.
CREATE OR REPLACE FUNCTION app.default_agent_name(p_locale text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE lower(split_part(replace(btrim(p_locale), '_', '-'), '-', 1))
    WHEN 'en' THEN 'Agent'
    WHEN 'fr' THEN 'Agent'
    WHEN 'es' THEN 'Agente'
    WHEN 'sr' THEN 'Agent'
    WHEN 'de' THEN 'Agent'
    WHEN 'pt' THEN 'Agente'
    WHEN 'it' THEN 'Agente'
    WHEN 'nl' THEN 'Agent'
    ELSE 'Agent'
  END
$$;
REVOKE ALL ON FUNCTION app.default_agent_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.default_agent_name(text) TO lobbystack_app, lobbystack_worker;

-- Old code can't name an agent, and a column default can't read the business,
-- so this gives its inserts through the view the translated name. A row that
-- can't see its business keeps the name it has. Slice 5 drops this trigger
-- with the view.
CREATE OR REPLACE FUNCTION app.localize_default_agent_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.is_default AND NEW.name = 'Agent' THEN
    NEW.name := COALESCE(
      (SELECT app.default_agent_name(business.default_locale) FROM public.businesses business WHERE business.id = NEW.business_id),
      NEW.name
    );
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.localize_default_agent_name() FROM PUBLIC;

DROP TRIGGER IF EXISTS agents_localize_default_name ON public.agents;
CREATE TRIGGER agents_localize_default_name
  BEFORE INSERT ON public.agents
  FOR EACH ROW EXECUTE FUNCTION app.localize_default_agent_name();

UPDATE public.agents agent
SET name = app.default_agent_name(business.default_locale)
FROM public.businesses business
WHERE business.id = agent.business_id
  AND agent.is_default
  AND agent.name = 'Agent'
  AND agent.name <> app.default_agent_name(business.default_locale);

-- A business can have no row yet, because the profile used to be saved on
-- first edit. It gets what defaultReceptionistProfile gives one, which is what
-- the snapshot and the API already show it, so its calls don't change.
INSERT INTO public.agents (business_id, name, greeting, tone, summary, booking_policy, transfer_mode, appointment_change_policy)
SELECT
  business.id,
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
  business.name,
  'Confirm availability before booking.',
  'on_request',
  '{"enabled": true, "allowCancel": true, "allowReschedule": true, "verificationMode": "phone_match_and_facts"}'::jsonb
FROM public.businesses business
WHERE NOT EXISTS (SELECT 1 FROM public.agents agent WHERE agent.business_id = business.id)
ON CONFLICT (business_id) DO NOTHING;

-- Old code's view of each business's default agent: the old columns and no
-- new ones. It runs as its caller, so the table's grants and policy still
-- decide what each role sees and changes, and a single table keeps it
-- automatically updatable for the old insert, upsert, update, FOR UPDATE and
-- FOR SHARE. The grants are the old table's, and the dispatcher still has none.
-- Slice 5 drops it once no older worker or admin can run.
CREATE OR REPLACE VIEW public.receptionist_profiles WITH (security_invoker = true) AS
  SELECT
    id, business_id, greeting, tone, summary, booking_policy, voice_instructions, sms_instructions,
    transfer_mode, transfer_number, appointment_change_policy, created_at, updated_at, chat_instructions,
    booking_mode, summary_source, summary_fingerprint, summary_generated_at, summary_regenerate_status,
    voice, staff_first_mode, staff_first_number, staff_first_ring_seconds, staff_first_message,
    staff_first_handover_message
  FROM public.agents
  WHERE is_default;
REVOKE ALL ON public.receptionist_profiles FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receptionist_profiles TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.receptionist_profiles TO lobbystack_readonly;

-- From 0097, reading the renamed table.
CREATE OR REPLACE FUNCTION app.list_summary_backfill_businesses()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT a.business_id
  FROM public.agents a
  WHERE a.is_default
    AND a.summary_source = 'placeholder'
    AND (
      EXISTS (SELECT 1 FROM public.knowledge_snippets s WHERE s.business_id = a.business_id AND s.active)
      OR EXISTS (SELECT 1 FROM public.knowledge_documents d WHERE d.business_id = a.business_id AND d.active AND d.status = 'indexed')
    )
    AND session_user = 'lobbystack_dispatcher'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'dispatcher'
$$;
