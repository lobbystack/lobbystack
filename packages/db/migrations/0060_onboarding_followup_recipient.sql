-- Resolves who should receive the founder check-in email a day after a
-- workspace finishes onboarding. The worker cannot read sessions or other
-- users through RLS, so this resolver answers the single question it needs:
-- is there an active owner who has not come back since onboarding? It answers
-- only for the business bound to the calling worker transaction.
--
-- "Came back" means a login session created or refreshed, or any call on the
-- business (dashboard test call, website widget, or phone), more than an hour
-- after onboarding completed. The hour covers activity that trails the final
-- onboarding step.
CREATE OR REPLACE FUNCTION app.resolve_onboarding_followup_recipient(target_business_id uuid, onboarding_completed_at timestamptz)
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
    AND NOT EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.user_id = u.id
        AND greatest(s.created_at, s.updated_at) > onboarding_completed_at + interval '1 hour'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.business_id = b.id
        AND c.started_at > onboarding_completed_at + interval '1 hour'
    )
  ORDER BY m.created_at
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_onboarding_followup_recipient(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_onboarding_followup_recipient(uuid, timestamptz) TO lobbystack_worker;
