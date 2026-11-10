-- "Agent" in the seven caller languages added after Dutch. defaultAgentName in
-- @lobbystack/shared is the same list. Filipino's tag, fil, counts as Tagalog,
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
    WHEN 'pl' THEN 'Agent'
    WHEN 'tr' THEN 'Asistan'
    WHEN 'vi' THEN 'Trợ lý'
    WHEN 'tl' THEN 'Assistant'
    WHEN 'fil' THEN 'Assistant'
    WHEN 'sv' THEN 'Agent'
    WHEN 'ru' THEN 'Агент'
    WHEN 'uk' THEN 'Агент'
    ELSE 'Agent'
  END
$$;
REVOKE ALL ON FUNCTION app.default_agent_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.default_agent_name(text) TO lobbystack_app, lobbystack_worker;
