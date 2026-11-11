-- A business's first agent was called "Agent", which read like a label in the
-- agent switcher and lists. It's "Default agent" now, in each caller language.
-- defaultAgentName in @lobbystack/shared is the same list. Filipino's tag, fil,
-- counts as Tagalog, as normalizeRuntimeLocale does.
CREATE OR REPLACE FUNCTION app.default_agent_name(p_locale text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE lower(split_part(replace(btrim(p_locale), '_', '-'), '-', 1))
    WHEN 'en' THEN 'Default agent'
    WHEN 'fr' THEN 'Agent par défaut'
    WHEN 'es' THEN 'Agente predeterminado'
    WHEN 'sr' THEN 'Podrazumevani agent'
    WHEN 'de' THEN 'Standard-Agent'
    WHEN 'pt' THEN 'Agente padrão'
    WHEN 'it' THEN 'Agente predefinito'
    WHEN 'nl' THEN 'Standaardagent'
    WHEN 'pl' THEN 'Domyślny agent'
    WHEN 'tr' THEN 'Varsayılan asistan'
    WHEN 'vi' THEN 'Trợ lý mặc định'
    WHEN 'tl' THEN 'Default na assistant'
    WHEN 'fil' THEN 'Default na assistant'
    WHEN 'sv' THEN 'Standardagent'
    WHEN 'ru' THEN 'Агент по умолчанию'
    WHEN 'uk' THEN 'Агент за замовчуванням'
    ELSE 'Default agent'
  END
$$;
REVOKE ALL ON FUNCTION app.default_agent_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.default_agent_name(text) TO lobbystack_app, lobbystack_worker;

ALTER TABLE public.agents ALTER COLUMN name SET DEFAULT 'Default agent';

-- A default agent still on 0198's name for its business's language gets the new
-- one. A name an operator chose stays, and so does a non-default agent's, which
-- may be a first agent that stopped being the default. updated_at stays too, as
-- when the name follows a change of language. The snapshot lists agents' names,
-- so each renamed agent's business refreshes it.
WITH renamed AS (
  UPDATE public.agents AS agent
  SET name = app.default_agent_name(business.default_locale)
  FROM public.businesses AS business
  WHERE business.id = agent.business_id
    AND agent.is_default
    AND agent.name = CASE lower(split_part(replace(btrim(business.default_locale), '_', '-'), '-', 1))
      WHEN 'es' THEN 'Agente'
      WHEN 'pt' THEN 'Agente'
      WHEN 'it' THEN 'Agente'
      WHEN 'tr' THEN 'Asistan'
      WHEN 'vi' THEN 'Trợ lý'
      WHEN 'tl' THEN 'Assistant'
      WHEN 'fil' THEN 'Assistant'
      WHEN 'ru' THEN 'Агент'
      WHEN 'uk' THEN 'Агент'
      ELSE 'Agent'
    END
  RETURNING agent.id, agent.business_id
)
INSERT INTO public.outbox_messages (topic, payload, business_id, aggregate_type, aggregate_id, dedupe_key)
SELECT
  'snapshot.refresh',
  jsonb_build_object('businessId', renamed.business_id, 'reason', 'agent_updated'),
  renamed.business_id,
  'agent',
  renamed.id,
  'migration:0202:snapshot:' || renamed.id
FROM renamed
ON CONFLICT (dedupe_key) DO NOTHING;
