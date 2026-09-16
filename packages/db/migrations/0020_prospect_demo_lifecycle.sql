CREATE OR REPLACE FUNCTION app.resolve_prospect_demo_by_token(p_token_hash text)
RETURNS TABLE (
  prospect_demo_id uuid,
  business_id uuid,
  business_slug text,
  business_name text,
  website_url text,
  locale text,
  suggested_prompts jsonb,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT demo.id, demo.business_id, business.slug::text, demo.business_name,
    demo.website_url, demo.locale::text, demo.suggested_prompts,
    demo.status::text, demo.expires_at
  FROM public.prospect_demos demo
  JOIN public.businesses business ON business.id = demo.business_id
  WHERE demo.token_hash = p_token_hash
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_prospect_demo_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_prospect_demo_by_token(text) TO lobbystack_app, lobbystack_worker;
