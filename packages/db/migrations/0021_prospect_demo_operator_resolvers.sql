CREATE OR REPLACE FUNCTION app.resolve_operator_prospect_demo(p_demo_id uuid)
RETURNS TABLE (demo_id uuid, business_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT demo.id, demo.business_id
  FROM public.prospect_demos demo
  WHERE demo.id = p_demo_id
    AND demo.operator_user_id = app.current_user_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.list_operator_prospect_demos()
RETURNS TABLE (demo_id uuid, business_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT demo.id, demo.business_id
  FROM public.prospect_demos demo
  WHERE demo.operator_user_id = app.current_user_id()
  ORDER BY demo.created_at DESC
$$;

CREATE OR REPLACE FUNCTION app.expire_prospect_demos()
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH expired AS (
    UPDATE public.prospect_demos
    SET status = 'revoked', updated_at = now()
    WHERE status IN ('preparing', 'active') AND expires_at <= now()
    RETURNING id
  )
  SELECT count(*) FROM expired
$$;

REVOKE ALL ON FUNCTION app.resolve_operator_prospect_demo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_operator_prospect_demos() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.expire_prospect_demos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_operator_prospect_demo(uuid) TO lobbystack_app;
GRANT EXECUTE ON FUNCTION app.list_operator_prospect_demos() TO lobbystack_app;
GRANT EXECUTE ON FUNCTION app.expire_prospect_demos() TO lobbystack_worker;
