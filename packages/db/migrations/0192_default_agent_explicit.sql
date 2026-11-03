-- Slice 5 changes agents.is_default to default false once a business can have
-- several agents. app.default_agent_id inserted a default agent by leaving the
-- column out, so it now sets the column. Nothing else changes, and every
-- business still has one agent.
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
  INSERT INTO public.agents (business_id, is_default, name, greeting, tone, summary, booking_policy, transfer_mode, appointment_change_policy)
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
