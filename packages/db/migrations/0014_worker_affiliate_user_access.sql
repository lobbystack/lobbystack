DROP POLICY IF EXISTS users_worker_affiliate_access ON public.users;
CREATE POLICY users_worker_affiliate_access ON public.users
  FOR SELECT TO lobbystack_worker
  USING (app.current_actor_type() = 'worker');

GRANT SELECT (id, email, name) ON public.users TO lobbystack_worker;
