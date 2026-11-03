-- The first real conversation of each business: a call or chat between its
-- agent or team and a customer, not a test call or a call from the team's own
-- verified phone. Its one row per business makes the
-- conversation.first_real_recorded event fire once, however many conversations
-- race to be first. It can't be worked out from calls and messages, because
-- content retention deletes transcripts and messages, and a business would then
-- look new again.

CREATE TABLE IF NOT EXISTS public.first_real_conversations (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  channel varchar(32) NOT NULL CHECK (channel IN ('voice', 'web_voice', 'web_chat', 'instagram', 'sms')),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Businesses that already had one keep it, so their next conversation doesn't
-- read as their first. Calls are matched loosely, because retention may have
-- deleted their transcripts and older calls never stored when media started.
INSERT INTO public.first_real_conversations (business_id, channel, conversation_id, occurred_at)
SELECT DISTINCT ON (past.business_id) past.business_id, past.channel, past.conversation_id, past.occurred_at
FROM (
  SELECT c.business_id, CASE WHEN c.transport = 'web_voice' THEN 'web_voice' ELSE 'voice' END AS channel, c.conversation_id, c.started_at AS occurred_at, contact.phone
  FROM public.calls c
  LEFT JOIN public.contacts contact ON contact.id = c.contact_id
  WHERE c.ended_at IS NOT NULL
    AND c.status IN ('completed', 'transferred')
    AND c.prospect_demo_id IS NULL
    AND coalesce(c.disposition, '') NOT IN ('spam_ended', 'setup_failed', 'blocked_contact')
    AND (c.transport <> 'web_voice' OR c.widget_id = 'lobbystack-widget')
    AND coalesce(c.provider_duration_seconds, 0) > 0
  UNION ALL
  SELECT m.business_id, conversation.channel, m.conversation_id, m.created_at AS occurred_at, contact.phone
  FROM public.messages m
  JOIN public.conversations conversation ON conversation.id = m.conversation_id
  LEFT JOIN public.contacts contact ON contact.id = conversation.contact_id
  WHERE m.direction = 'outbound'
    AND coalesce(m.provider_status, '') <> 'compliance_reply'
    AND conversation.channel IN ('web_chat', 'instagram', 'sms')
    AND EXISTS (SELECT 1 FROM public.messages inbound WHERE inbound.conversation_id = m.conversation_id AND inbound.direction = 'inbound')
) past
WHERE past.phone IS NULL OR NOT (
  EXISTS (
    SELECT 1 FROM public.business_memberships m
    JOIN public.users u ON u.id = m.user_id
    WHERE m.business_id = past.business_id AND u.phone = past.phone AND u.phone_verified_at IS NOT NULL
  )
  OR EXISTS (SELECT 1 FROM public.number_trials t WHERE t.business_id = past.business_id AND t.verified_phone = past.phone)
)
ORDER BY past.business_id, past.occurred_at
ON CONFLICT (business_id) DO NOTHING;

ALTER TABLE public.first_real_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first_real_conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS first_real_conversations_tenant_isolation ON public.first_real_conversations;
CREATE POLICY first_real_conversations_tenant_isolation ON public.first_real_conversations
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
GRANT SELECT, INSERT ON public.first_real_conversations TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.first_real_conversations TO lobbystack_readonly;

-- A worker transaction can't read users' phones or the memberships of a
-- business, so the one thing the event needs comes from here: who owns the
-- business, to attribute the event to a person, and whether `caller_phone` is
-- one of its team's verified phones.
CREATE OR REPLACE FUNCTION app.first_real_conversation_facts(target_business_id uuid, caller_phone text)
RETURNS TABLE(owner_user_id uuid, team_phone boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    (
      SELECT m.user_id FROM public.business_memberships m
      WHERE m.business_id = target_business_id AND m.role = 'business_owner' AND m.status = 'active'
      ORDER BY m.created_at
      LIMIT 1
    ),
    caller_phone IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.business_memberships m
        JOIN public.users u ON u.id = m.user_id
        WHERE m.business_id = target_business_id AND m.status = 'active' AND u.phone = caller_phone AND u.phone_verified_at IS NOT NULL
      )
      OR EXISTS (SELECT 1 FROM public.number_trials t WHERE t.business_id = target_business_id AND t.verified_phone = caller_phone)
    )
  WHERE target_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
$$;
REVOKE ALL ON FUNCTION app.first_real_conversation_facts(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.first_real_conversation_facts(uuid, text) TO lobbystack_app, lobbystack_worker;
