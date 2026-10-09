-- The worker gives every business jobs that run each minute: orphaned call
-- recovery, telemetry flush, outbox backlog sample and daily summary. A
-- business with no active member, such as an expired prospect demo, can't
-- sign in or take calls, so the worker drops those jobs for it. Its scheduler
-- refresh runs as the dispatcher, which lists businesses (0008) and now also
-- reads which ones still have an active member. It sees only these two columns.
DROP POLICY IF EXISTS business_memberships_dispatcher_select ON public.business_memberships;
CREATE POLICY business_memberships_dispatcher_select ON public.business_memberships
  FOR SELECT TO lobbystack_dispatcher
  USING (app.current_actor_type() = 'dispatcher');
GRANT SELECT (business_id, status) ON public.business_memberships TO lobbystack_dispatcher;
