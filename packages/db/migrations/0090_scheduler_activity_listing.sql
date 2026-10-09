-- The worker scheduled orphaned call recovery once a minute for every
-- business, and gave every business with a member three more jobs a minute,
-- including signups abandoned long ago. These two listings let it schedule
-- one recovery job in all, and the per-minute jobs only for businesses in use.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- The worker reads calls only inside one business's RLS context. Recovery
-- needs to know which businesses have an open call before it reads them, so
-- this returns those business ids and nothing else.
CREATE OR REPLACE FUNCTION app.list_open_live_call_businesses(p_started_after timestamptz, p_started_before timestamptz)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT c.business_id
  FROM public.calls c
  WHERE c.ended_at IS NULL
    AND c.provider = 'openai_live'
    AND c.started_at > p_started_after
    AND c.started_at < p_started_before
    AND session_user = 'lobbystack_worker'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'worker'
$$;

REVOKE ALL ON FUNCTION app.list_open_live_call_businesses(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_open_live_call_businesses(timestamptz, timestamptz) TO lobbystack_worker;

-- A business is active when it has an active member and either finished
-- onboarding or, in the last 30 days, had a call, a message, or a member who
-- signed in. The rest are dormant. Sign-ins live in the auth tables, which the
-- dispatcher can't read, so this returns only each business id and the flag.
CREATE OR REPLACE FUNCTION app.list_scheduler_businesses()
RETURNS TABLE (business_id uuid, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT b.id,
    EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.business_id = b.id AND m.status = 'active')
    AND (
      b.onboarding_stage = 'complete'
      OR EXISTS (SELECT 1 FROM public.calls c WHERE c.business_id = b.id AND c.started_at > now() - interval '30 days')
      OR EXISTS (SELECT 1 FROM public.messages msg WHERE msg.business_id = b.id AND msg.created_at > now() - interval '30 days')
      OR EXISTS (
        SELECT 1
        FROM public.business_memberships m
        JOIN public.sessions s ON s.user_id = m.user_id
        WHERE m.business_id = b.id
          AND m.status = 'active'
          AND greatest(s.created_at, s.updated_at) > now() - interval '30 days'
      )
    )
  FROM public.businesses b
  WHERE session_user = 'lobbystack_dispatcher'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'dispatcher'
$$;

REVOKE ALL ON FUNCTION app.list_scheduler_businesses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_scheduler_businesses() TO lobbystack_dispatcher;

-- 0081 let the dispatcher read memberships for the same listing. The function
-- above replaces that, so take the access back.
DROP POLICY IF EXISTS business_memberships_dispatcher_select ON public.business_memberships;
REVOKE SELECT (business_id, status) ON public.business_memberships FROM lobbystack_dispatcher;
