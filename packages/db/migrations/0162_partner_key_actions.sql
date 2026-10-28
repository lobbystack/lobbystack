-- A partner's platform key now does what the partner's console does, through
-- the v1 Partner endpoints: demos, packages, brand, domains, templates, team
-- and billing. A key acts as the partner, with no person behind it (ADR
-- 0010), so a transaction run for a key names the key in app.platform_key_id
-- instead of a user in app.user_id. app.partner_role then answers admin for
-- the key's own partner while the key is active, and the policies that let
-- a partner's admins read and change its rows let the key do the same, on its
-- partner only. The domain refuses a key what only owners may do, and the
-- grant of the owner-only billing scopes stays with owners.

CREATE OR REPLACE FUNCTION app.current_platform_key_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.platform_key_id', true), '')::uuid
$$;
REVOKE ALL ON FUNCTION app.current_platform_key_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_platform_key_id() TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;

-- A person's role comes first. A transaction for a key names no person, so
-- the key's admin rights never mix with someone's own.
CREATE OR REPLACE FUNCTION app.partner_role(target_partner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT member.role::text
      FROM public.partner_members member
      WHERE member.partner_id = target_partner_id
        AND member.user_id = app.current_user_id()
        AND member.status = 'active'),
    (SELECT 'admin'
      FROM public.partner_platform_keys key
      WHERE app.current_user_id() IS NULL
        AND key.id = app.current_platform_key_id()
        AND key.partner_id = target_partner_id
        AND key.revoked_at IS NULL)
  )
$$;
REVOKE ALL ON FUNCTION app.partner_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_role(uuid) TO lobbystack_app, lobbystack_worker, lobbystack_readonly;

-- Checks that a key is one of the partner's and still active, and holds a
-- share lock on its row until the transaction ends, so a revoke waits for
-- what the request writes and then finds it. The console's app role runs a
-- key's partner operations, as an operator or the system.
CREATE OR REPLACE FUNCTION app.lock_partner_platform_key(p_partner_id uuid, p_key_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's setting.
  IF COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'none') NOT IN ('operator', 'worker', 'system') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.partner_platform_keys key WHERE key.id = p_key_id AND key.partner_id = p_partner_id AND key.revoked_at IS NULL FOR SHARE;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION app.lock_partner_platform_key(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_partner_platform_key(uuid, uuid) TO lobbystack_app, lobbystack_worker;

-- The owner who made a key, while they're still one of the partner's active
-- owners, or null. A tier checkout is made out to a person, and a key has
-- none, so a key's checkout goes to the owner who made it.
CREATE OR REPLACE FUNCTION app.partner_platform_key_owner(p_partner_id uuid, p_key_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT key.created_by_user_id
  FROM public.partner_platform_keys key
  JOIN public.partner_members member
    ON member.partner_id = key.partner_id AND member.user_id = key.created_by_user_id AND member.status = 'active' AND member.role = 'owner'
  WHERE key.id = p_key_id AND key.partner_id = p_partner_id AND key.revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION app.partner_platform_key_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_platform_key_owner(uuid, uuid) TO lobbystack_app;

-- Whether the transaction's key is the partner's, active, and holds a scope.
-- What only an owner may do in the console, a key does only with a scope an
-- owner granted it, which the database checks too.
CREATE OR REPLACE FUNCTION app.partner_key_has_scope(target_partner_id uuid, p_scope text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_platform_keys key
    WHERE app.current_user_id() IS NULL
      AND key.id = app.current_platform_key_id()
      AND key.partner_id = target_partner_id
      AND key.revoked_at IS NULL
      AND key.scopes ? p_scope
  )
$$;
REVOKE ALL ON FUNCTION app.partner_key_has_scope(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_key_has_scope(uuid, text) TO lobbystack_app, lobbystack_worker, lobbystack_readonly;

-- The pool's overage, as 0153 set it, which a key an owner granted
-- partner.billing:write may now change as well.
CREATE OR REPLACE FUNCTION app.set_partner_pool_overage(target_partner_id uuid, p_enabled boolean, p_cap_cents integer)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
BEGIN
  IF current_setting('app.actor_type', true) IS DISTINCT FROM 'operator'
    OR (app.partner_role(target_partner_id) IS DISTINCT FROM 'owner' AND NOT app.partner_key_has_scope(target_partner_id, 'partner.billing:write')) THEN
    RAISE EXCEPTION 'owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL OR (p_cap_cents IS NOT NULL AND p_cap_cents < 0) THEN
    RAISE EXCEPTION 'invalid_pool_overage' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.partner_billing_accounts AS account (partner_id, billing_key, pool_voice_seconds, pool_chats, included_numbers, pool_overage_enabled, pool_overage_cap_cents)
  VALUES (target_partner_id, 'partner:' || target_partner_id::text, 1800, 50, 0, p_enabled, p_cap_cents)
  ON CONFLICT (partner_id) DO UPDATE SET
    pool_overage_enabled = EXCLUDED.pool_overage_enabled,
    pool_overage_cap_cents = EXCLUDED.pool_overage_cap_cents,
    updated_at = now();
END
$$;
REVOKE ALL ON FUNCTION app.set_partner_pool_overage(uuid, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_partner_pool_overage(uuid, boolean, integer) TO lobbystack_app;

-- A key invites people to the partner's team as the partner. Its invitation
-- names the key instead of a person, and works while the key does.
ALTER TABLE public.partner_invitations ALTER COLUMN invited_by_user_id DROP NOT NULL;
ALTER TABLE public.partner_invitations ADD COLUMN IF NOT EXISTS invited_by_platform_key_id uuid REFERENCES public.partner_platform_keys(id) ON DELETE CASCADE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.partner_invitations'::regclass AND conname = 'partner_invitations_inviter_check') THEN
    ALTER TABLE public.partner_invitations ADD CONSTRAINT partner_invitations_inviter_check CHECK (invited_by_user_id IS NOT NULL OR invited_by_platform_key_id IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS partner_invitations_platform_key_idx ON public.partner_invitations (invited_by_platform_key_id) WHERE invited_by_platform_key_id IS NOT NULL;

-- A key makes the partner's demos too. A partner's demo has no operator on
-- its business's team, so the key that made it stands in for the person.
-- Keys are kept for good once made, as webhook endpoints name them, so no
-- foreign key.
ALTER TABLE public.prospect_demos ALTER COLUMN operator_user_id DROP NOT NULL;
ALTER TABLE public.prospect_demos ADD COLUMN IF NOT EXISTS created_by_platform_key_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.prospect_demos'::regclass AND conname = 'prospect_demos_maker_check') THEN
    ALTER TABLE public.prospect_demos ADD CONSTRAINT prospect_demos_maker_check CHECK (operator_user_id IS NOT NULL OR (created_by_platform_key_id IS NOT NULL AND partner_id IS NOT NULL)) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.prospect_demos VALIDATE CONSTRAINT prospect_demos_maker_check;

-- Idempotency-Key records for the Partner endpoints, which act on no one
-- business and so can't use idempotency_keys, whose rows each belong to a
-- business. A record belongs to the partner and names the key in its scope.
-- Only a transaction for one of the partner's active keys reads or writes them.
CREATE TABLE IF NOT EXISTS public.partner_api_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  scope varchar(120) NOT NULL,
  key varchar(255) NOT NULL,
  request_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'processing',
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_api_idempotency_keys_status_check CHECK (status IN ('processing', 'completed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_api_idempotency_keys_unique ON public.partner_api_idempotency_keys (partner_id, scope, key);
CREATE INDEX IF NOT EXISTS partner_api_idempotency_keys_created_idx ON public.partner_api_idempotency_keys (created_at);

ALTER TABLE public.partner_api_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_idempotency_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_api_idempotency_keys_key_access ON public.partner_api_idempotency_keys;
CREATE POLICY partner_api_idempotency_keys_key_access ON public.partner_api_idempotency_keys FOR ALL
  USING (app.current_actor_type() = 'operator' AND app.current_user_id() IS NULL AND app.current_platform_key_id() IS NOT NULL AND app.partner_role(partner_id) IS NOT NULL)
  WITH CHECK (app.current_actor_type() = 'operator' AND app.current_user_id() IS NULL AND app.current_platform_key_id() IS NOT NULL AND app.partner_role(partner_id) IS NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_api_idempotency_keys TO lobbystack_app;
GRANT SELECT ON public.partner_api_idempotency_keys TO lobbystack_readonly;

-- Owners read their partner's tier checkouts, as 0144 lets them, and so does
-- a key an owner granted a billing scope.
DROP POLICY IF EXISTS partner_checkout_requests_read ON public.partner_checkout_requests;
CREATE POLICY partner_checkout_requests_read ON public.partner_checkout_requests FOR SELECT
  USING (
    app.current_actor_type() IN ('system', 'worker')
    OR (app.current_actor_type() = 'operator' AND (
      app.partner_role(partner_id) = 'owner'
      OR app.partner_key_has_scope(partner_id, 'partner.billing:read')
      OR app.partner_key_has_scope(partner_id, 'partner.billing:write')
    ))
  );
