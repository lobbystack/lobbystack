-- Durable setup-guide state and voice follow-up inbox items.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS setup_guide_skipped_steps jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind varchar(64) NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  related_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL DEFAULT 'open',
  content_retention_status varchar(32) NOT NULL DEFAULT 'active',
  content_expires_at timestamptz,
  legacy_convex_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_items_status_check CHECK (status IN ('open', 'done')),
  CONSTRAINT inbox_items_retention_check CHECK (content_retention_status IN ('active', 'scrubbed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_items_legacy_convex_id_unique ON public.inbox_items(legacy_convex_id);
CREATE INDEX IF NOT EXISTS inbox_items_business_status_idx ON public.inbox_items(business_id, status);
CREATE INDEX IF NOT EXISTS inbox_items_business_kind_status_idx ON public.inbox_items(business_id, kind, status);
CREATE INDEX IF NOT EXISTS inbox_items_related_call_idx ON public.inbox_items(related_call_id);
ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbox_items_tenant_isolation ON public.inbox_items;
CREATE POLICY inbox_items_tenant_isolation ON public.inbox_items
  USING (
    business_id = app.current_business_id()
    AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))
  )
  WITH CHECK (
    business_id = app.current_business_id()
    AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_items TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.inbox_items TO lobbystack_readonly;
