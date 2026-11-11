-- A rule can be kept to one channel: voice (phone and browser calls), sms,
-- web_chat or instagram. Null, as every rule has had, means every channel.
ALTER TABLE public.agent_rules ADD COLUMN IF NOT EXISTS channel varchar(16);
ALTER TABLE public.agent_rules DROP CONSTRAINT IF EXISTS agent_rules_channel_check;
ALTER TABLE public.agent_rules
  ADD CONSTRAINT agent_rules_channel_check CHECK (channel IS NULL OR channel IN ('voice', 'sms', 'web_chat', 'instagram'));

-- A rule's title in a business's default language (businesses.default_locale,
-- as stored), for the rules this file and its trigger write. channelRuleTitle
-- in @lobbystack/shared is the same list, and a test checks the two match. An
-- unknown language gets English.
CREATE OR REPLACE FUNCTION app.channel_rule_title(p_channel text, p_default_locale text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  WITH titles (locale, voice, sms, web_chat, instagram) AS (
    VALUES
      ('en', 'On calls', 'In texts', 'In website chat', 'On Instagram'),
      ('fr', 'Pendant les appels', 'Par texto', 'Dans le chat du site', 'Sur Instagram'),
      ('es', 'En las llamadas', 'Por SMS', 'En el chat del sitio web', 'En Instagram'),
      ('sr', 'U pozivima', 'U SMS porukama', 'U četu na sajtu', 'Na Instagramu'),
      ('de', 'Bei Anrufen', 'Per SMS', 'Im Website-Chat', 'Auf Instagram'),
      ('pt', 'Nas ligações', 'Por SMS', 'No chat do site', 'No Instagram'),
      ('it', 'Nelle chiamate', 'Via SMS', 'Nella chat del sito', 'Su Instagram'),
      ('nl', 'Bij gesprekken', 'Via sms', 'In de websitechat', 'Op Instagram'),
      ('pl', 'Podczas rozmów', 'W SMS-ach', 'W czacie na stronie', 'Na Instagramie'),
      ('tr', 'Aramalarda', 'SMS''lerde', 'Web sitesi sohbetinde', 'Instagram''da'),
      ('vi', 'Trong cuộc gọi', 'Trong tin nhắn SMS', 'Trong khung chat trên website', 'Trên Instagram'),
      ('tl', 'Sa mga tawag', 'Sa mga text', 'Sa chat ng website', 'Sa Instagram'),
      ('sv', 'I samtal', 'I sms', 'I webbchatten', 'På Instagram'),
      ('ru', 'Во время звонков', 'В SMS', 'В чате на сайте', 'В Instagram'),
      ('uk', 'Під час дзвінків', 'В SMS', 'У чаті на сайті', 'В Instagram')
  ),
  wanted AS (
    SELECT CASE lower(split_part(replace(btrim(coalesce(p_default_locale, '')), '_', '-'), '-', 1))
      WHEN 'fil' THEN 'tl'
      ELSE lower(split_part(replace(btrim(coalesce(p_default_locale, '')), '_', '-'), '-', 1))
    END AS locale
  )
  SELECT CASE p_channel
      WHEN 'voice' THEN coalesce(title.voice, english.voice)
      WHEN 'sms' THEN coalesce(title.sms, english.sms)
      WHEN 'web_chat' THEN coalesce(title.web_chat, english.web_chat)
      ELSE coalesce(title.instagram, english.instagram)
    END
  FROM titles AS english
  CROSS JOIN wanted
  LEFT JOIN titles AS title ON title.locale = wanted.locale
  WHERE english.locale = 'en'
$$;

-- Each agent's instructions become rules kept to their channel, after its
-- other rules, titled in its business's default language. Chat instructions
-- answered website chat and Instagram, so they become a website chat rule, and
-- an Instagram rule too when the business has an Instagram account linked (a
-- row in instagram_accounts, even one waiting to reconnect). An agent that
-- already has a rule for a channel gets none for it, so running this twice
-- adds nothing. The columns stay until a later release drops them; no code
-- reads them now.
--
-- Calls read rules from the snapshot, but this file queues no refresh: the
-- previous worker, still draining, could take the job and build a snapshot
-- without channels, where a channel rule reads as one for every channel. New
-- code instead rebuilds any snapshot whose schemaVersion is older than
-- SNAPSHOT_SCHEMA_VERSION before it reads it (getCachedBusinessSnapshot).
WITH wanted AS (
  SELECT agent.id AS agent_id, agent.business_id, item.channel, btrim(item.content) AS content, item.position,
    app.channel_rule_title(item.channel, business.default_locale) AS title
  FROM public.agents AS agent
  JOIN public.businesses AS business ON business.id = agent.business_id
  CROSS JOIN LATERAL (VALUES
    ('voice', agent.voice_instructions, 1),
    ('sms', agent.sms_instructions, 2),
    ('web_chat', agent.chat_instructions, 3),
    ('instagram', agent.chat_instructions, 4)
  ) AS item (channel, content, position)
  WHERE btrim(coalesce(item.content, '')) <> ''
    AND (item.channel <> 'instagram' OR EXISTS (
      SELECT 1 FROM public.instagram_accounts AS account WHERE account.business_id = agent.business_id
    ))
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_rules AS rule
      WHERE rule.business_id = agent.business_id AND rule.agent_id = agent.id AND rule.channel = item.channel
    )
)
INSERT INTO public.agent_rules (business_id, agent_id, title, content, active, sort_order, channel)
SELECT wanted.business_id, wanted.agent_id, wanted.title, wanted.content, true,
  coalesce((SELECT max(rule.sort_order) FROM public.agent_rules AS rule WHERE rule.business_id = wanted.business_id AND rule.agent_id = wanted.agent_id), -1)
    + row_number() OVER (PARTITION BY wanted.agent_id ORDER BY wanted.position),
  wanted.channel
FROM wanted;

-- Until the admin finishes deploying, the previous admin still saves an
-- agent's instructions to these columns, and new code never reads them. This
-- trigger copies each change onto the agent's rules the way the deprecated API
-- fields write them (channelRules.ts): text changes the channel's first rule
-- and turns it on, or adds one titled after the channel; an empty value
-- deletes that rule. Chat instructions write the website chat rule, and the
-- Instagram rule when the agent has one or the business has Instagram linked.
-- New code never writes the columns, so only old code fires it. The save that
-- changed them already queues a snapshot refresh. The release that drops the
-- columns drops this trigger and its function.
CREATE OR REPLACE FUNCTION app.copy_agent_instructions_to_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_locale text;
  v_item record;
  v_value text;
  v_rule_id uuid;
BEGIN
  SELECT business.default_locale INTO v_locale FROM public.businesses AS business WHERE business.id = NEW.business_id;
  FOR v_item IN
    SELECT * FROM (VALUES
      ('voice', OLD.voice_instructions, NEW.voice_instructions),
      ('sms', OLD.sms_instructions, NEW.sms_instructions),
      ('web_chat', OLD.chat_instructions, NEW.chat_instructions),
      ('instagram', OLD.chat_instructions, NEW.chat_instructions)
    ) AS item (channel, old_value, new_value)
  LOOP
    CONTINUE WHEN v_item.old_value IS NOT DISTINCT FROM v_item.new_value;
    v_value := nullif(btrim(coalesce(v_item.new_value, '')), '');
    -- Serializes with insertAgentRuleInTransaction, which takes the same lock.
    PERFORM pg_advisory_xact_lock(hashtextextended('agent-rules:' || NEW.business_id::text || ':' || NEW.id::text, 0));
    SELECT rule.id INTO v_rule_id FROM public.agent_rules AS rule
      WHERE rule.business_id = NEW.business_id AND rule.agent_id = NEW.id AND rule.channel = v_item.channel
      ORDER BY rule.sort_order, rule.created_at, rule.id LIMIT 1;
    IF v_value IS NULL THEN
      DELETE FROM public.agent_rules WHERE id = v_rule_id;
    ELSIF v_rule_id IS NOT NULL THEN
      UPDATE public.agent_rules SET content = v_value, active = true, updated_at = now()
        WHERE id = v_rule_id AND (content IS DISTINCT FROM v_value OR NOT active);
    ELSIF v_item.channel <> 'instagram' OR EXISTS (SELECT 1 FROM public.instagram_accounts AS account WHERE account.business_id = NEW.business_id) THEN
      INSERT INTO public.agent_rules (business_id, agent_id, title, content, active, sort_order, channel)
      VALUES (NEW.business_id, NEW.id, app.channel_rule_title(v_item.channel, v_locale), v_value, true,
        coalesce((SELECT max(rule.sort_order) FROM public.agent_rules AS rule WHERE rule.business_id = NEW.business_id AND rule.agent_id = NEW.id), -1) + 1,
        v_item.channel);
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION app.copy_agent_instructions_to_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS agents_copy_instructions_to_rules ON public.agents;
CREATE TRIGGER agents_copy_instructions_to_rules
  AFTER UPDATE OF voice_instructions, sms_instructions, chat_instructions ON public.agents
  FOR EACH ROW EXECUTE FUNCTION app.copy_agent_instructions_to_rules();
