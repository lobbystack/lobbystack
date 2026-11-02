-- What owners answer to the founder's check-in email. One row per business and
-- answer makes a second click on a link change nothing, and the row outlives
-- the product event that reports it.

CREATE TABLE IF NOT EXISTS public.check_in_answers (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  answer varchar(32) NOT NULL CHECK (answer IN ('still_testing', 'connect_number', 'test_call_mistakes', 'not_a_fit')),
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, answer)
);

ALTER TABLE public.check_in_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_answers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS check_in_answers_tenant_isolation ON public.check_in_answers;
CREATE POLICY check_in_answers_tenant_isolation ON public.check_in_answers
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
GRANT SELECT, INSERT ON public.check_in_answers TO lobbystack_app;
GRANT SELECT ON public.check_in_answers TO lobbystack_readonly;

-- The check-in now goes to any active owner whose business has had no real
-- conversation. Signing in or making a test call no longer takes an owner off
-- the list: an owner who is still testing is who the email asks. A database
-- that ran this migration as 0172 replays it, so nothing here may fail on a
-- second run.
CREATE OR REPLACE FUNCTION app.resolve_onboarding_followup_recipient(target_business_id uuid)
RETURNS TABLE(user_id uuid, email text, name text, preferred_locale text, business_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT u.id, u.email, u.name, u.preferred_locale::text, b.name
  FROM public.businesses b
  JOIN public.business_memberships m ON m.business_id = b.id AND m.role = 'business_owner' AND m.status = 'active'
  JOIN public.users u ON u.id = m.user_id
  WHERE session_user = 'lobbystack_worker'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'worker'
    AND target_business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
    AND b.id = target_business_id
    AND b.status = 'active'
    AND b.onboarding_stage = 'complete'
    AND NOT EXISTS (SELECT 1 FROM public.first_real_conversations f WHERE f.business_id = b.id)
  ORDER BY m.created_at
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_onboarding_followup_recipient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_onboarding_followup_recipient(uuid) TO lobbystack_worker;

-- The worker from the previous release keeps calling the old signature while it
-- drains, so it stays as a thin alias. The date no longer matters. Slice 8 of
-- docs/specs/multi-agent-build.md drops this.
CREATE OR REPLACE FUNCTION app.resolve_onboarding_followup_recipient(target_business_id uuid, onboarding_completed_at timestamptz)
RETURNS TABLE(user_id uuid, email text, name text, preferred_locale text, business_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT * FROM app.resolve_onboarding_followup_recipient(target_business_id)
$$;

REVOKE ALL ON FUNCTION app.resolve_onboarding_followup_recipient(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_onboarding_followup_recipient(uuid, timestamptz) TO lobbystack_worker;
