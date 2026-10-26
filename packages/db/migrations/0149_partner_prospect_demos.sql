-- A partner's team makes prospect demos from the console under the partner's
-- brand. A partner's demo is one of the partner's businesses from the start,
-- with no owner and the access level the partner picked, so its usage counts
-- like any other of its businesses' and claiming it keeps it with the
-- partner. The partner's people work in it through opens, never on its team,
-- so they reach its demo through the functions below rather than as its
-- operator.

-- The partner whose team made the demo, or null for the host's own demos.
-- The demo's business names the same partner while it stays with it.
-- Deleting the partner keeps the demo's record of a business it released.
ALTER TABLE public.prospect_demos ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS prospect_demos_partner_idx ON public.prospect_demos (partner_id, created_at) WHERE partner_id IS NOT NULL;

-- The console's Demos page. Its people aren't on the demos' teams, so RLS
-- shows them none of a demo's rows; this answers instead, only for someone
-- on the partner's team, with each of the partner's demos whose business
-- still belongs to it. A business the partner released leaves the list.
CREATE OR REPLACE FUNCTION app.list_partner_prospect_demos(p_partner_id uuid)
RETURNS TABLE (demo_id uuid, business_id uuid, status text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT demo.id, demo.business_id, demo.status::text, demo.created_at
  FROM public.prospect_demos demo
  JOIN public.businesses business ON business.id = demo.business_id AND business.partner_id = demo.partner_id
  WHERE demo.partner_id = p_partner_id
    AND business.status = 'active'
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) IN ('operator', 'system')
    AND app.partner_role(p_partner_id) IS NOT NULL
  ORDER BY demo.created_at DESC, demo.id
$$;
REVOKE ALL ON FUNCTION app.list_partner_prospect_demos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_partner_prospect_demos(uuid) TO lobbystack_app;

-- The host's demo operator manages only the host's own demos, so a partner's
-- demo never reaches the host's Demos page, even when its maker is the
-- operator too. Everything else is as 0021 defined them.
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
    AND demo.partner_id IS NULL
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
    AND demo.partner_id IS NULL
  ORDER BY demo.created_at DESC
$$;

REVOKE ALL ON FUNCTION app.resolve_operator_prospect_demo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_operator_prospect_demos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_operator_prospect_demo(uuid) TO lobbystack_app;
GRANT EXECUTE ON FUNCTION app.list_operator_prospect_demos() TO lobbystack_app;
