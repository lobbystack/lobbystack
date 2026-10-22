-- A business's connected Instagram professional account, for answering its
-- direct messages. The long-lived Instagram User access token is encrypted
-- with ENCRYPTION_KEY before it is stored and lasts 60 days; the worker
-- refreshes it before it expires. One business per Instagram account: Meta
-- sends that account's messages to one place.
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  connected_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  instagram_user_id text NOT NULL,
  username text,
  encrypted_access_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'connected',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS instagram_accounts_instagram_user_unique ON public.instagram_accounts(instagram_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS instagram_accounts_business_unique ON public.instagram_accounts(business_id);

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS instagram_accounts_tenant_isolation ON public.instagram_accounts;
CREATE POLICY instagram_accounts_tenant_isolation ON public.instagram_accounts
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_accounts TO lobbystack_app, lobbystack_worker;
GRANT SELECT (id, business_id, instagram_user_id, username, token_expires_at, status, last_error, created_at, updated_at) ON public.instagram_accounts TO lobbystack_readonly;

-- The Instagram-scoped ID of a person who messaged the business on Instagram.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram_user_id text;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_business_instagram_unique ON public.contacts(business_id, instagram_user_id) WHERE instagram_user_id IS NOT NULL;

-- Instagram's webhook names only the receiving account, so it finds the
-- business before any business context exists.
CREATE OR REPLACE FUNCTION app.resolve_business_by_instagram_account(p_instagram_user_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT account.business_id
  FROM public.instagram_accounts account
  JOIN public.businesses business ON business.id = account.business_id
  WHERE account.instagram_user_id = p_instagram_user_id
    AND account.status = 'connected'
    AND business.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_instagram_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_instagram_account(text) TO lobbystack_app, lobbystack_worker;
