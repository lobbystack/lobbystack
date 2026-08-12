CREATE TABLE IF NOT EXISTS public.prospect_demos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'preparing',
  locale varchar(8) NOT NULL DEFAULT 'en',
  suggested_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipient_email text,
  recipient_name text,
  campaign_id text,
  website_url text NOT NULL,
  business_name text NOT NULL,
  operator_user_id uuid NOT NULL REFERENCES public.users(id),
  website_ingestion_job_id uuid REFERENCES public.website_ingestion_jobs(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  published_at timestamptz,
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES public.users(id),
  legacy_convex_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_demos_status_check CHECK (status IN ('preparing', 'active', 'claimed', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS prospect_demos_token_hash_unique ON public.prospect_demos(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_demos_business_unique ON public.prospect_demos(business_id);
CREATE INDEX IF NOT EXISTS prospect_demos_status_expires_idx ON public.prospect_demos(status, expires_at);

ALTER TABLE public.prospect_demos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_demos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospect_demos_tenant_isolation ON public.prospect_demos;
CREATE POLICY prospect_demos_tenant_isolation ON public.prospect_demos
  USING (
    business_id = app.current_business_id()
    AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))
  )
  WITH CHECK (
    business_id = app.current_business_id()
    AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_demos TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.prospect_demos TO lobbystack_readonly;

CREATE OR REPLACE FUNCTION app.resolve_business_by_demo_token(p_token_hash text)
RETURNS TABLE (business_id uuid, prospect_demo_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT demo.business_id, demo.id
  FROM public.prospect_demos demo
  JOIN public.businesses business ON business.id = demo.business_id
  WHERE demo.token_hash = p_token_hash
    AND demo.status = 'active'
    AND demo.expires_at > now()
    AND business.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_demo_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_demo_token(text) TO lobbystack_app, lobbystack_worker;
