-- A business can run several AI receptionists. Each receptionist ("agent" in
-- code) owns its instructions, greeting, voice, language, booking mode and
-- transfer rules. Phone numbers, website widget keys, calls and conversations
-- point at the receptionist that handled them.
--
-- Every business gets one default receptionist backfilled from its
-- receptionist_profiles row. From here on `agents` is the source of truth. The
-- default receptionist is mirrored back into receptionist_profiles by a trigger
-- so an admin build from before this migration keeps reading current settings
-- and a rollback loses nothing for single-receptionist businesses.
--
-- Numbered 0067 so it sorts after 0066_public_api.sql (PR #211).

CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  greeting text NOT NULL,
  tone text NOT NULL,
  summary text NOT NULL,
  booking_policy text NOT NULL,
  voice_instructions text,
  sms_instructions text,
  chat_instructions text,
  transfer_mode varchar(32) NOT NULL DEFAULT 'on_request',
  transfer_number text,
  appointment_change_policy jsonb,
  booking_mode varchar(16) NOT NULL DEFAULT 'instant',
  voice varchar(32),
  language varchar(8),
  receptionist_profile_id uuid REFERENCES public.receptionist_profiles(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agents_id_business_unique UNIQUE (id, business_id),
  CONSTRAINT agents_name_length_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT agents_booking_mode_check CHECK (booking_mode IN ('off', 'request', 'instant')),
  CONSTRAINT agents_transfer_mode_check CHECK (transfer_mode IN ('never', 'always', 'on_request', 'on_urgent', 'during_business_hours')),
  CONSTRAINT agents_language_check CHECK (language IS NULL OR language IN ('en', 'fr')),
  CONSTRAINT agents_default_not_archived_check CHECK (NOT (is_default AND archived_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS agents_business_default_unique
  ON public.agents (business_id) WHERE is_default AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS agents_business_created_idx ON public.agents (business_id, created_at);

-- Knowledge and services are shared by the business. A receptionist uses all of
-- them unless it has an opt-out row. Every reference is a composite key with
-- business_id, so an opt-out can only name items of its own business.
ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_id_business_unique;
ALTER TABLE public.services ADD CONSTRAINT services_id_business_unique UNIQUE (id, business_id);
ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_id_business_unique;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_id_business_unique UNIQUE (id, business_id);
ALTER TABLE public.knowledge_snippets DROP CONSTRAINT IF EXISTS knowledge_snippets_id_business_unique;
ALTER TABLE public.knowledge_snippets ADD CONSTRAINT knowledge_snippets_id_business_unique UNIQUE (id, business_id);

CREATE TABLE IF NOT EXISTS public.agent_knowledge_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  knowledge_document_id uuid,
  knowledge_snippet_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_knowledge_opt_outs_agent_fk FOREIGN KEY (agent_id, business_id) REFERENCES public.agents(id, business_id) ON DELETE CASCADE,
  CONSTRAINT agent_knowledge_opt_outs_document_fk FOREIGN KEY (knowledge_document_id, business_id) REFERENCES public.knowledge_documents(id, business_id) ON DELETE CASCADE,
  CONSTRAINT agent_knowledge_opt_outs_snippet_fk FOREIGN KEY (knowledge_snippet_id, business_id) REFERENCES public.knowledge_snippets(id, business_id) ON DELETE CASCADE,
  CONSTRAINT agent_knowledge_opt_outs_one_item_check CHECK (num_nonnulls(knowledge_document_id, knowledge_snippet_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_knowledge_opt_outs_document_unique
  ON public.agent_knowledge_opt_outs (agent_id, knowledge_document_id) WHERE knowledge_document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agent_knowledge_opt_outs_snippet_unique
  ON public.agent_knowledge_opt_outs (agent_id, knowledge_snippet_id) WHERE knowledge_snippet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_knowledge_opt_outs_business_idx ON public.agent_knowledge_opt_outs (business_id);

CREATE TABLE IF NOT EXISTS public.agent_service_opt_outs (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  service_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, service_id),
  CONSTRAINT agent_service_opt_outs_agent_fk FOREIGN KEY (agent_id, business_id) REFERENCES public.agents(id, business_id) ON DELETE CASCADE,
  CONSTRAINT agent_service_opt_outs_service_fk FOREIGN KEY (service_id, business_id) REFERENCES public.services(id, business_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_service_opt_outs_business_idx ON public.agent_service_opt_outs (business_id);

-- Staff management is opt-in. Businesses already running more than one active
-- staff member keep seeing their team.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS staff_enabled boolean NOT NULL DEFAULT false;
UPDATE public.businesses AS business
SET staff_enabled = true
WHERE (SELECT count(*) FROM public.staff AS member WHERE member.business_id = business.id AND member.active) > 1;

-- Backfill one default receptionist per business from its profile.
INSERT INTO public.agents (
  business_id, name, is_default, greeting, tone, summary, booking_policy,
  voice_instructions, sms_instructions, chat_instructions, transfer_mode,
  transfer_number, appointment_change_policy, booking_mode, receptionist_profile_id,
  created_at, updated_at
)
SELECT
  business.id,
  CASE WHEN business.default_locale = 'fr' THEN 'Réceptionniste' ELSE 'Receptionist' END,
  true,
  COALESCE(profile.greeting, 'Thank you for calling ' || business.name || '.'),
  COALESCE(profile.tone, 'professional'),
  COALESCE(profile.summary, business.name),
  COALESCE(profile.booking_policy, 'Confirm availability before booking.'),
  profile.voice_instructions,
  profile.sms_instructions,
  profile.chat_instructions,
  CASE WHEN profile.transfer_mode IN ('never', 'always', 'on_request', 'on_urgent', 'during_business_hours') THEN profile.transfer_mode ELSE 'on_request' END,
  profile.transfer_number,
  profile.appointment_change_policy,
  COALESCE(profile.booking_mode, 'instant'),
  profile.id,
  COALESCE(profile.created_at, business.created_at),
  COALESCE(profile.updated_at, now())
FROM public.businesses AS business
LEFT JOIN public.receptionist_profiles AS profile ON profile.business_id = business.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.agents AS agent WHERE agent.business_id = business.id AND agent.archived_at IS NULL
);

-- Returns the business's default receptionist, creating one when a business
-- has none (rows inserted by imports or tests that predate receptionists).
-- Not granted to runtime roles; only the triggers below call it.
CREATE OR REPLACE FUNCTION app.default_agent_id(target_business_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  found_id uuid;
BEGIN
  IF target_business_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT id INTO found_id FROM public.agents
  WHERE business_id = target_business_id AND is_default AND archived_at IS NULL
  LIMIT 1;
  IF found_id IS NOT NULL THEN
    RETURN found_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lobbystack:default-agent:' || target_business_id::text));
  SELECT id INTO found_id FROM public.agents
  WHERE business_id = target_business_id AND archived_at IS NULL
  ORDER BY is_default DESC, created_at, id
  LIMIT 1;
  IF found_id IS NOT NULL THEN
    UPDATE public.agents SET is_default = true, updated_at = now()
    WHERE id = found_id AND NOT is_default;
    RETURN found_id;
  END IF;

  INSERT INTO public.agents (
    business_id, name, is_default, greeting, tone, summary, booking_policy,
    voice_instructions, sms_instructions, chat_instructions, transfer_mode,
    transfer_number, appointment_change_policy, booking_mode, receptionist_profile_id
  )
  SELECT
    business.id,
    CASE WHEN business.default_locale = 'fr' THEN 'Réceptionniste' ELSE 'Receptionist' END,
    true,
    COALESCE(profile.greeting, 'Thank you for calling ' || business.name || '.'),
    COALESCE(profile.tone, 'professional'),
    COALESCE(profile.summary, business.name),
    COALESCE(profile.booking_policy, 'Confirm availability before booking.'),
    profile.voice_instructions,
    profile.sms_instructions,
    profile.chat_instructions,
    CASE WHEN profile.transfer_mode IN ('never', 'always', 'on_request', 'on_urgent', 'during_business_hours') THEN profile.transfer_mode ELSE 'on_request' END,
    profile.transfer_number,
    profile.appointment_change_policy,
    COALESCE(profile.booking_mode, 'instant'),
    profile.id
  FROM public.businesses AS business
  LEFT JOIN public.receptionist_profiles AS profile ON profile.business_id = business.id
  WHERE business.id = target_business_id
  RETURNING id INTO found_id;
  RETURN found_id;
END
$$;

REVOKE ALL ON FUNCTION app.default_agent_id(uuid) FROM PUBLIC;

-- Rows written without a receptionist go to the business's default one, so
-- older code paths and imports keep working after agent_id becomes NOT NULL.
CREATE OR REPLACE FUNCTION app.assign_default_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.agent_id IS NULL THEN
    NEW.agent_id := app.default_agent_id(NEW.business_id);
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.assign_default_agent() FROM PUBLIC;

-- Numbers and widget keys can only route to a receptionist that still exists.
CREATE OR REPLACE FUNCTION app.require_active_agent_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agents WHERE id = NEW.agent_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot route to a deleted receptionist.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.require_active_agent_route() FROM PUBLIC;

-- A business always keeps at least one receptionist, its default one, and
-- nothing routes to a deleted receptionist.
CREATE OR REPLACE FUNCTION app.guard_agent_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.agents
      WHERE business_id = NEW.business_id AND archived_at IS NULL AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'A business needs at least one receptionist.' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.phone_numbers WHERE agent_id = NEW.id AND status IN ('active', 'provisioning', 'reclaiming'))
      OR EXISTS (SELECT 1 FROM public.widget_keys WHERE agent_id = NEW.id AND status <> 'revoked') THEN
      RAISE EXCEPTION 'Move this receptionist''s numbers and widget before deleting it.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.guard_agent_archive() FROM PUBLIC;

-- Keeps receptionist_profiles equal to the default receptionist for rollback.
CREATE OR REPLACE FUNCTION app.mirror_default_agent_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.is_default AND NEW.archived_at IS NULL THEN
    INSERT INTO public.receptionist_profiles (
      business_id, greeting, tone, summary, booking_policy, voice_instructions,
      sms_instructions, chat_instructions, transfer_mode, transfer_number,
      appointment_change_policy, booking_mode, updated_at
    ) VALUES (
      NEW.business_id, NEW.greeting, NEW.tone, NEW.summary, NEW.booking_policy, NEW.voice_instructions,
      NEW.sms_instructions, NEW.chat_instructions, NEW.transfer_mode, NEW.transfer_number,
      NEW.appointment_change_policy, NEW.booking_mode, now()
    )
    ON CONFLICT (business_id) DO UPDATE SET
      greeting = EXCLUDED.greeting,
      tone = EXCLUDED.tone,
      summary = EXCLUDED.summary,
      booking_policy = EXCLUDED.booking_policy,
      voice_instructions = EXCLUDED.voice_instructions,
      sms_instructions = EXCLUDED.sms_instructions,
      chat_instructions = EXCLUDED.chat_instructions,
      transfer_mode = EXCLUDED.transfer_mode,
      transfer_number = EXCLUDED.transfer_number,
      appointment_change_policy = EXCLUDED.appointment_change_policy,
      booking_mode = EXCLUDED.booking_mode,
      updated_at = now();
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION app.mirror_default_agent_profile() FROM PUBLIC;

-- Writes that still target receptionist_profiles (an admin build from before
-- this migration during a rolling deploy, or the Convex import scripts) land on
-- the default receptionist. The depth check stops the two mirrors from looping.
CREATE OR REPLACE FUNCTION app.mirror_profile_to_default_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  target_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  target_id := app.default_agent_id(NEW.business_id);
  UPDATE public.agents SET
    greeting = NEW.greeting,
    tone = NEW.tone,
    summary = NEW.summary,
    booking_policy = NEW.booking_policy,
    voice_instructions = NEW.voice_instructions,
    sms_instructions = NEW.sms_instructions,
    chat_instructions = NEW.chat_instructions,
    transfer_mode = CASE WHEN NEW.transfer_mode IN ('never', 'always', 'on_request', 'on_urgent', 'during_business_hours') THEN NEW.transfer_mode ELSE transfer_mode END,
    transfer_number = NEW.transfer_number,
    appointment_change_policy = NEW.appointment_change_policy,
    booking_mode = NEW.booking_mode,
    receptionist_profile_id = NEW.id,
    updated_at = now()
  WHERE id = target_id;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION app.mirror_profile_to_default_agent() FROM PUBLIC;

DROP TRIGGER IF EXISTS receptionist_profiles_mirror_default_agent ON public.receptionist_profiles;
CREATE TRIGGER receptionist_profiles_mirror_default_agent
  AFTER INSERT OR UPDATE ON public.receptionist_profiles
  FOR EACH ROW EXECUTE FUNCTION app.mirror_profile_to_default_agent();

DROP TRIGGER IF EXISTS agents_guard_archive ON public.agents;
CREATE TRIGGER agents_guard_archive
  BEFORE UPDATE OF archived_at ON public.agents
  FOR EACH ROW EXECUTE FUNCTION app.guard_agent_archive();

DROP TRIGGER IF EXISTS agents_mirror_default_profile ON public.agents;
CREATE TRIGGER agents_mirror_default_profile
  AFTER INSERT OR UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION app.mirror_default_agent_profile();

-- Point existing rows at the default receptionist.
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.widget_keys ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.agent_rules ADD COLUMN IF NOT EXISTS agent_id uuid;

UPDATE public.phone_numbers AS target SET agent_id = agent.id
FROM public.agents AS agent
WHERE target.agent_id IS NULL AND agent.business_id = target.business_id AND agent.is_default AND agent.archived_at IS NULL;
UPDATE public.widget_keys AS target SET agent_id = agent.id
FROM public.agents AS agent
WHERE target.agent_id IS NULL AND agent.business_id = target.business_id AND agent.is_default AND agent.archived_at IS NULL;
UPDATE public.calls AS target SET agent_id = agent.id
FROM public.agents AS agent
WHERE target.agent_id IS NULL AND agent.business_id = target.business_id AND agent.is_default AND agent.archived_at IS NULL;
UPDATE public.conversations AS target SET agent_id = agent.id
FROM public.agents AS agent
WHERE target.agent_id IS NULL AND agent.business_id = target.business_id AND agent.is_default AND agent.archived_at IS NULL;
UPDATE public.agent_rules AS target SET agent_id = agent.id
FROM public.agents AS agent
WHERE target.agent_id IS NULL AND agent.business_id = target.business_id AND agent.is_default AND agent.archived_at IS NULL;

ALTER TABLE public.phone_numbers ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.widget_keys ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.calls ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.agent_rules ALTER COLUMN agent_id SET NOT NULL;

-- The composite keys keep every reference inside the row's own business.
ALTER TABLE public.phone_numbers DROP CONSTRAINT IF EXISTS phone_numbers_agent_fk;
ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_agent_fk
  FOREIGN KEY (agent_id, business_id) REFERENCES public.agents(id, business_id);
ALTER TABLE public.widget_keys DROP CONSTRAINT IF EXISTS widget_keys_agent_fk;
ALTER TABLE public.widget_keys ADD CONSTRAINT widget_keys_agent_fk
  FOREIGN KEY (agent_id, business_id) REFERENCES public.agents(id, business_id);
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_agent_fk;
ALTER TABLE public.calls ADD CONSTRAINT calls_agent_fk
  FOREIGN KEY (agent_id, business_id) REFERENCES public.agents(id, business_id);
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_agent_fk;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_agent_fk
  FOREIGN KEY (agent_id, business_id) REFERENCES public.agents(id, business_id);
ALTER TABLE public.agent_rules DROP CONSTRAINT IF EXISTS agent_rules_agent_fk;
ALTER TABLE public.agent_rules ADD CONSTRAINT agent_rules_agent_fk
  FOREIGN KEY (agent_id, business_id) REFERENCES public.agents(id, business_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS phone_numbers_agent_idx ON public.phone_numbers (agent_id);
CREATE INDEX IF NOT EXISTS widget_keys_agent_idx ON public.widget_keys (agent_id);
CREATE INDEX IF NOT EXISTS calls_business_agent_started_idx ON public.calls (business_id, agent_id, started_at);
CREATE INDEX IF NOT EXISTS conversations_business_agent_idx ON public.conversations (business_id, agent_id);
CREATE INDEX IF NOT EXISTS agent_rules_agent_order_idx ON public.agent_rules (agent_id, sort_order);

DROP TRIGGER IF EXISTS phone_numbers_assign_default_agent ON public.phone_numbers;
CREATE TRIGGER phone_numbers_assign_default_agent
  BEFORE INSERT ON public.phone_numbers
  FOR EACH ROW EXECUTE FUNCTION app.assign_default_agent();
DROP TRIGGER IF EXISTS widget_keys_assign_default_agent ON public.widget_keys;
CREATE TRIGGER widget_keys_assign_default_agent
  BEFORE INSERT ON public.widget_keys
  FOR EACH ROW EXECUTE FUNCTION app.assign_default_agent();
DROP TRIGGER IF EXISTS calls_assign_default_agent ON public.calls;
CREATE TRIGGER calls_assign_default_agent
  BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION app.assign_default_agent();
DROP TRIGGER IF EXISTS conversations_assign_default_agent ON public.conversations;
CREATE TRIGGER conversations_assign_default_agent
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION app.assign_default_agent();
DROP TRIGGER IF EXISTS agent_rules_assign_default_agent ON public.agent_rules;
CREATE TRIGGER agent_rules_assign_default_agent
  BEFORE INSERT ON public.agent_rules
  FOR EACH ROW EXECUTE FUNCTION app.assign_default_agent();

DROP TRIGGER IF EXISTS phone_numbers_require_active_agent ON public.phone_numbers;
CREATE TRIGGER phone_numbers_require_active_agent
  BEFORE INSERT OR UPDATE OF agent_id ON public.phone_numbers
  FOR EACH ROW EXECUTE FUNCTION app.require_active_agent_route();
DROP TRIGGER IF EXISTS widget_keys_require_active_agent ON public.widget_keys;
CREATE TRIGGER widget_keys_require_active_agent
  BEFORE INSERT OR UPDATE OF agent_id ON public.widget_keys
  FOR EACH ROW EXECUTE FUNCTION app.require_active_agent_route();

-- Tenant isolation, same policy as every other per-business table.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['agents', 'agent_knowledge_opt_outs', 'agent_service_opt_outs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON public.%I USING (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id))) WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id)))',
      table_name, table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_app, lobbystack_worker', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO lobbystack_readonly', table_name);
  END LOOP;
END
$$;

-- Routing for calls and texts: the business and the receptionist that answers
-- the dialled number.
CREATE OR REPLACE FUNCTION app.resolve_phone_route(phone_e164 text)
RETURNS TABLE (business_id uuid, agent_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT number.business_id, number.agent_id
  FROM public.phone_numbers number
  WHERE number.e164 = phone_e164 AND number.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_phone_route(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_phone_route(text) TO lobbystack_app, lobbystack_worker;

-- The widget resolver now also returns the receptionist behind the key. The
-- return type changes, so the function is dropped and recreated.
DROP FUNCTION IF EXISTS app.resolve_business_by_widget_key(text);
CREATE FUNCTION app.resolve_business_by_widget_key(p_key_hash text)
RETURNS TABLE (business_id uuid, widget_key_id uuid, agent_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT key.business_id, key.id, key.agent_id
  FROM public.widget_keys key
  JOIN public.businesses business ON business.id = key.business_id
  WHERE key.key_hash = p_key_hash
    AND key.status = 'active'
    AND business.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_widget_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_widget_key(text) TO lobbystack_app, lobbystack_worker;
