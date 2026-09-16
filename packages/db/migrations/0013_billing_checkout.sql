CREATE TABLE IF NOT EXISTS public.billing_checkout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target varchar(32) NOT NULL,
  billing_interval varchar(16) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  checkout_id text,
  checkout_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_checkout_requests_business_status_idx
  ON public.billing_checkout_requests (business_id, status, created_at);

ALTER TABLE public.billing_checkout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_checkout_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_checkout_requests_tenant_isolation ON public.billing_checkout_requests;
CREATE POLICY billing_checkout_requests_tenant_isolation ON public.billing_checkout_requests
  USING (
    business_id = app.current_business_id()
    AND (
      app.current_actor_type() IN ('worker', 'dispatcher')
      OR app.has_business_membership(business_id)
    )
  )
  WITH CHECK (
    business_id = app.current_business_id()
    AND (
      app.current_actor_type() IN ('worker', 'dispatcher')
      OR app.has_business_membership(business_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_checkout_requests TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.billing_checkout_requests TO lobbystack_readonly;
