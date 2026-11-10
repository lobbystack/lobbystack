-- The Portuguese default greeting opened with "Obrigado", which marks the
-- speaker as a man, and the default voice is a woman's. Agents still on that
-- greeting get the new default, and their snapshots refresh so calls use it.
-- Greetings an operator edited stay as they are.
WITH updated AS (
  UPDATE public.agents AS agent
  SET greeting = 'Agradecemos sua ligação para ' || btrim(business.name) || '. Como posso ajudar você hoje?',
      updated_at = now()
  FROM public.businesses AS business
  WHERE business.id = agent.business_id
    AND agent.greeting = 'Obrigado por ligar para ' || btrim(business.name) || '. Como posso ajudar você hoje?'
  RETURNING agent.id, agent.business_id
)
INSERT INTO public.outbox_messages (topic, payload, business_id, aggregate_type, aggregate_id, dedupe_key)
SELECT
  'snapshot.refresh',
  jsonb_build_object('businessId', updated.business_id, 'reason', 'agent_updated'),
  updated.business_id,
  'agent',
  updated.id,
  'migration:0201:snapshot:' || updated.id
FROM updated
ON CONFLICT (dedupe_key) DO NOTHING;
