-- A channel belongs to one agent, and a rule to the agent it shapes (ADR 0012).
-- These four tables hold a few rows per business, so this file fills them in
-- one statement each, under the brief lock that adds the column. calls and
-- conversations follow in 0185 and 0186, which take a lock on one table each
-- and leave their old rows to the batched backfill that `migrate` runs last.
--
-- Old code doesn't know agent_id, and new code doesn't set it until slice 4, so
-- a trigger fills it. The trigger also runs on update, because the NOT NULL
-- check below applies to any row that changes, and an old row could otherwise
-- fail on its next update. NOT NULL takes two releases: this one adds the
-- check NOT VALID, and the next validates it and sets the column.
--
-- The foreign keys are composite, so a row can't point at another business's
-- agent. They have no cascade, because an agent with history is archived and
-- never deleted. They are deferred, because deleting a business cascades to
-- its agents and its channels in no fixed order: checked at the end of each
-- cascaded statement, the agent's delete would fail while its rows remain.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Migration 0184 needs a role that bypasses row-level security, and % does not.', current_user;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS agents_business_id_id_unique ON public.agents (business_id, id);

-- The business's default agent. A business normally has one from the moment
-- it's created, but code that inserts a business directly may add a channel
-- before its agent, or never add one, and the check would refuse that row. So
-- this creates the agent 0183 would have, and a later upsert through
-- ON CONFLICT (business_id) keeps working. The conflict clause names no index
-- because slice 5 replaces the one it would name.
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
  WHERE business.id = p_business_id
  ON CONFLICT DO NOTHING;
  SELECT agent.id INTO v_agent_id FROM public.agents agent WHERE agent.business_id = p_business_id AND agent.is_default;
  RETURN v_agent_id;
END
$$;
-- It creates an agent in any business it's given, so no runtime role calls it.
REVOKE ALL ON FUNCTION app.default_agent_id(uuid) FROM PUBLIC;

-- Runs as its owner, so the dispatcher's lack of a grant on agents and an
-- operator's RLS context can't leave a row without its agent. The row's own
-- policy still decides whether the write goes through.
CREATE OR REPLACE FUNCTION app.assign_default_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.agent_id := app.default_agent_id(NEW.business_id);
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.assign_default_agent() FROM PUBLIC;

-- phone_numbers
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  DROP CONSTRAINT IF EXISTS phone_numbers_agent_fk,
  DROP CONSTRAINT IF EXISTS phone_numbers_agent_id_present;
UPDATE public.phone_numbers SET agent_id = app.default_agent_id(business_id) WHERE agent_id IS NULL;
ALTER TABLE public.phone_numbers
  ADD CONSTRAINT phone_numbers_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT phone_numbers_agent_id_present CHECK (agent_id IS NOT NULL) NOT VALID;
DROP TRIGGER IF EXISTS phone_numbers_assign_agent ON public.phone_numbers;
CREATE TRIGGER phone_numbers_assign_agent
  BEFORE INSERT OR UPDATE ON public.phone_numbers
  FOR EACH ROW WHEN (NEW.agent_id IS NULL) EXECUTE FUNCTION app.assign_default_agent();

-- widget_keys
ALTER TABLE public.widget_keys
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  DROP CONSTRAINT IF EXISTS widget_keys_agent_fk,
  DROP CONSTRAINT IF EXISTS widget_keys_agent_id_present;
UPDATE public.widget_keys SET agent_id = app.default_agent_id(business_id) WHERE agent_id IS NULL;
ALTER TABLE public.widget_keys
  ADD CONSTRAINT widget_keys_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT widget_keys_agent_id_present CHECK (agent_id IS NOT NULL) NOT VALID;
DROP TRIGGER IF EXISTS widget_keys_assign_agent ON public.widget_keys;
CREATE TRIGGER widget_keys_assign_agent
  BEFORE INSERT OR UPDATE ON public.widget_keys
  FOR EACH ROW WHEN (NEW.agent_id IS NULL) EXECUTE FUNCTION app.assign_default_agent();

-- instagram_accounts. The read-only role's grants here are per column, to keep
-- it away from the token, so a new column needs its own.
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  DROP CONSTRAINT IF EXISTS instagram_accounts_agent_fk,
  DROP CONSTRAINT IF EXISTS instagram_accounts_agent_id_present;
UPDATE public.instagram_accounts SET agent_id = app.default_agent_id(business_id) WHERE agent_id IS NULL;
ALTER TABLE public.instagram_accounts
  ADD CONSTRAINT instagram_accounts_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT instagram_accounts_agent_id_present CHECK (agent_id IS NOT NULL) NOT VALID;
DROP TRIGGER IF EXISTS instagram_accounts_assign_agent ON public.instagram_accounts;
CREATE TRIGGER instagram_accounts_assign_agent
  BEFORE INSERT OR UPDATE ON public.instagram_accounts
  FOR EACH ROW WHEN (NEW.agent_id IS NULL) EXECUTE FUNCTION app.assign_default_agent();
GRANT SELECT (agent_id) ON public.instagram_accounts TO lobbystack_readonly;

-- agent_rules
ALTER TABLE public.agent_rules
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  DROP CONSTRAINT IF EXISTS agent_rules_agent_fk,
  DROP CONSTRAINT IF EXISTS agent_rules_agent_id_present;
UPDATE public.agent_rules SET agent_id = app.default_agent_id(business_id) WHERE agent_id IS NULL;
ALTER TABLE public.agent_rules
  ADD CONSTRAINT agent_rules_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT agent_rules_agent_id_present CHECK (agent_id IS NOT NULL) NOT VALID;
DROP TRIGGER IF EXISTS agent_rules_assign_agent ON public.agent_rules;
CREATE TRIGGER agent_rules_assign_agent
  BEFORE INSERT OR UPDATE ON public.agent_rules
  FOR EACH ROW WHEN (NEW.agent_id IS NULL) EXECUTE FUNCTION app.assign_default_agent();
