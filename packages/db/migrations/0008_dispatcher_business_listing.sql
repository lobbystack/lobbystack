DROP POLICY IF EXISTS businesses_dispatcher_select ON public.businesses;
CREATE POLICY businesses_dispatcher_select ON public.businesses
  FOR SELECT TO lobbystack_dispatcher
  USING (app.current_actor_type() = 'dispatcher');
GRANT SELECT ON public.businesses TO lobbystack_dispatcher;
GRANT SELECT (id, active_business_id) ON public.users TO lobbystack_app;
