-- A rule can be kept to one channel: voice (phone and browser calls), sms,
-- web_chat or instagram. Null, as every rule has had, means every channel.
ALTER TABLE public.agent_rules ADD COLUMN IF NOT EXISTS channel varchar(16);
ALTER TABLE public.agent_rules DROP CONSTRAINT IF EXISTS agent_rules_channel_check;
ALTER TABLE public.agent_rules
  ADD CONSTRAINT agent_rules_channel_check CHECK (channel IS NULL OR channel IN ('voice', 'sms', 'web_chat', 'instagram'));

-- Each agent's instructions become rules kept to their channel, after its
-- other rules, titled in its business's default language. channelRuleTitle in
-- @lobbystack/shared is the same list. Chat instructions answered website chat
-- and Instagram, so they become a website chat rule, and an Instagram rule too
-- when the business has an Instagram account linked (a row in
-- instagram_accounts, even one waiting to reconnect). An agent that already
-- has a rule for a channel gets none for it, so running this twice adds nothing.
-- The columns stay until a later release drops them; no code reads them now.
-- Calls read rules from the snapshot, so each changed agent's refreshes.
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
agent_locales AS (
  SELECT agent.id AS agent_id, agent.business_id, agent.voice_instructions, agent.sms_instructions, agent.chat_instructions,
    CASE lower(split_part(replace(btrim(business.default_locale), '_', '-'), '-', 1))
      WHEN 'fil' THEN 'tl'
      ELSE lower(split_part(replace(btrim(business.default_locale), '_', '-'), '-', 1))
    END AS locale
  FROM public.agents AS agent
  JOIN public.businesses AS business ON business.id = agent.business_id
),
wanted AS (
  SELECT source.agent_id, source.business_id, item.channel, btrim(item.content) AS content, item.position,
    CASE item.channel
      WHEN 'voice' THEN coalesce(title.voice, english.voice)
      WHEN 'sms' THEN coalesce(title.sms, english.sms)
      WHEN 'web_chat' THEN coalesce(title.web_chat, english.web_chat)
      ELSE coalesce(title.instagram, english.instagram)
    END AS title
  FROM agent_locales AS source
  CROSS JOIN LATERAL (VALUES
    ('voice', source.voice_instructions, 1),
    ('sms', source.sms_instructions, 2),
    ('web_chat', source.chat_instructions, 3),
    ('instagram', source.chat_instructions, 4)
  ) AS item (channel, content, position)
  LEFT JOIN titles AS title ON title.locale = source.locale
  JOIN titles AS english ON english.locale = 'en'
  WHERE btrim(coalesce(item.content, '')) <> ''
    AND (item.channel <> 'instagram' OR EXISTS (
      SELECT 1 FROM public.instagram_accounts AS account WHERE account.business_id = source.business_id
    ))
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_rules AS rule
      WHERE rule.business_id = source.business_id AND rule.agent_id = source.agent_id AND rule.channel = item.channel
    )
),
inserted AS (
  INSERT INTO public.agent_rules (business_id, agent_id, title, content, active, sort_order, channel)
  SELECT wanted.business_id, wanted.agent_id, wanted.title, wanted.content, true,
    coalesce((SELECT max(rule.sort_order) FROM public.agent_rules AS rule WHERE rule.business_id = wanted.business_id AND rule.agent_id = wanted.agent_id), -1)
      + row_number() OVER (PARTITION BY wanted.agent_id ORDER BY wanted.position),
    wanted.channel
  FROM wanted
  RETURNING agent_id, business_id
)
INSERT INTO public.outbox_messages (topic, payload, business_id, aggregate_type, aggregate_id, dedupe_key)
SELECT DISTINCT
  'snapshot.refresh',
  jsonb_build_object('businessId', inserted.business_id, 'reason', 'agent_updated'),
  inserted.business_id,
  'agent',
  inserted.agent_id,
  'migration:0203:snapshot:' || inserted.agent_id
FROM inserted
ON CONFLICT (dedupe_key) DO NOTHING;
