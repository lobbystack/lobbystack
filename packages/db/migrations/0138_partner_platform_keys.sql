-- A partner makes its own platform keys in its console (ADR 0010). They are
-- the same lsp_ keys a host lists in PLATFORM_API_KEYS, kept here instead,
-- and each acts as its partner: it reaches the partner's businesses and no
-- others. Like a PLATFORM_API_KEYS entry, a row keeps the SHA-256 of its key,
-- never the key, which is shown once when it's made. The partner's owners and
-- admins make, read and revoke them; its members don't see them.
CREATE TABLE IF NOT EXISTS public.partner_platform_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  prefix varchar(12) NOT NULL CHECK (prefix ~ '^lsp_[0-9a-f]{8}$'),
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  -- A key made in a console reaches only its partner's businesses. A key
  -- with access "all" would reach every business on the deployment, so no
  -- row can hold one.
  access varchar(16) NOT NULL DEFAULT 'group',
  CONSTRAINT partner_platform_keys_access_check CHECK (access = 'group'),
  -- Required and never empty, so a key never gains a scope added after it was made.
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes) = 'array' AND jsonb_array_length(scopes) > 0),
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_platform_keys_prefix_unique ON public.partner_platform_keys (prefix);
CREATE UNIQUE INDEX IF NOT EXISTS partner_platform_keys_key_hash_unique ON public.partner_platform_keys (key_hash);
CREATE INDEX IF NOT EXISTS partner_platform_keys_partner_created_idx ON public.partner_platform_keys (partner_id, created_at);

ALTER TABLE public.partner_platform_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_platform_keys FORCE ROW LEVEL SECURITY;

-- Owners and admins read their partner's keys and make new ones as
-- themselves. Revoking is the only change, and it can't be undone.
DROP POLICY IF EXISTS partner_platform_keys_admin_read ON public.partner_platform_keys;
CREATE POLICY partner_platform_keys_admin_read ON public.partner_platform_keys FOR SELECT
  USING (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin'));
DROP POLICY IF EXISTS partner_platform_keys_admin_insert ON public.partner_platform_keys;
CREATE POLICY partner_platform_keys_admin_insert ON public.partner_platform_keys FOR INSERT
  WITH CHECK (
    app.current_actor_type() = 'operator'
    AND app.partner_role(partner_id) IN ('owner', 'admin')
    AND created_by_user_id = app.current_user_id()
    AND revoked_at IS NULL AND revoked_by_user_id IS NULL AND last_used_at IS NULL
  );
DROP POLICY IF EXISTS partner_platform_keys_admin_revoke ON public.partner_platform_keys;
CREATE POLICY partner_platform_keys_admin_revoke ON public.partner_platform_keys FOR UPDATE
  USING (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin') AND revoked_at IS NULL)
  WITH CHECK (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin') AND revoked_at IS NOT NULL AND revoked_by_user_id = app.current_user_id());

GRANT SELECT, INSERT ON public.partner_platform_keys TO lobbystack_app;
-- An update only revokes: no key moves to another partner or gets another
-- name, hash, access or scopes.
GRANT UPDATE (revoked_at, revoked_by_user_id, updated_at) ON public.partner_platform_keys TO lobbystack_app;
GRANT SELECT ON public.partner_platform_keys TO lobbystack_readonly;

-- API requests arrive with no tenant context, so this maps a presented key's
-- hash to its key and partner, as app.resolve_api_key does for a business's
-- own keys. A revoked key resolves to nothing. The admin checks
-- PLATFORM_API_KEYS first and asks this only for a key that isn't there.
-- Only the worker role, which serves /api/v1, may call it.
CREATE OR REPLACE FUNCTION app.resolve_partner_platform_key(p_key_hash text)
RETURNS TABLE (platform_key_id uuid, partner_id uuid, prefix varchar, name varchar, scopes jsonb, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT key.id, key.partner_id, key.prefix, key.name, key.scopes, key.created_at
  FROM public.partner_platform_keys key
  WHERE key.key_hash = p_key_hash
    AND key.revoked_at IS NULL
    AND key.access = 'group'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.resolve_partner_platform_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_partner_platform_key(text) TO lobbystack_worker;

-- Records when a partner's key was last used, at most once a minute, so busy
-- integrations don't write on every request. The worker role can't read the
-- table, so it records use through this.
CREATE OR REPLACE FUNCTION app.touch_partner_platform_key(p_key_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.partner_platform_keys
  SET last_used_at = now()
  WHERE id = p_key_id
    AND revoked_at IS NULL
    AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
$$;
REVOKE ALL ON FUNCTION app.touch_partner_platform_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.touch_partner_platform_key(uuid) TO lobbystack_worker;

-- A request resolves its key before its own transaction starts, so a revoke
-- can commit while the request still runs. A request calls this in the
-- transaction that writes what the key leaves behind, such as a webhook
-- endpoint, an invitation or a business. This holds a share lock on the
-- key's row until that transaction ends, so a revoke waits for the write and
-- then turns off what it wrote. A transaction that starts after the revoke
-- finds the key revoked and gets false. The worker role serves /api/v1, and
-- the app role creates a partner's businesses as the system for its keys.
CREATE OR REPLACE FUNCTION app.lock_active_partner_platform_key(p_key_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's setting.
  IF COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'none') NOT IN ('worker', 'system') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.partner_platform_keys key WHERE key.id = p_key_id AND key.revoked_at IS NULL FOR SHARE;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION app.lock_active_partner_platform_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_active_partner_platform_key(uuid) TO lobbystack_worker, lobbystack_app;

-- A partner's keys use the partner as their group (ADR 0010), so the
-- partner's businesses are that group's, in the table that links every
-- group's keys to their businesses. Each business of a partner is linked to
-- its group when it's made, whether the console or a key made it, and leaves
-- it when it leaves the partner, as a release will do. A partner's business
-- can't change partner otherwise (0135), so nothing else moves a link. These
-- run as the table's owner: the app role creates a partner's businesses and
-- can't write the links itself.
CREATE OR REPLACE FUNCTION app.link_partner_business_to_partner_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.partner_id IS NOT NULL THEN
    DELETE FROM public.platform_key_businesses WHERE business_id = OLD.id AND group_id = OLD.partner_id::text;
  END IF;
  IF NEW.partner_id IS NOT NULL THEN
    INSERT INTO public.platform_key_businesses (business_id, group_id) VALUES (NEW.id, NEW.partner_id::text) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION app.link_partner_business_to_partner_group() FROM PUBLIC;

DROP TRIGGER IF EXISTS businesses_link_partner_group_after_insert ON public.businesses;
CREATE TRIGGER businesses_link_partner_group_after_insert
AFTER INSERT ON public.businesses
FOR EACH ROW
WHEN (NEW.partner_id IS NOT NULL)
EXECUTE FUNCTION app.link_partner_business_to_partner_group();

DROP TRIGGER IF EXISTS businesses_relink_partner_group_after_update ON public.businesses;
CREATE TRIGGER businesses_relink_partner_group_after_update
AFTER UPDATE OF partner_id ON public.businesses
FOR EACH ROW
WHEN (OLD.partner_id IS DISTINCT FROM NEW.partner_id)
EXECUTE FUNCTION app.link_partner_business_to_partner_group();

-- A partner's group holds the partner's businesses and no others. A host's
-- PLATFORM_API_KEYS entry can name any group, a partner's id included, so
-- this refuses to link a business of no partner, or of another, to a
-- partner's group. Otherwise the partner's keys would reach it.
CREATE OR REPLACE FUNCTION app.keep_partner_group_to_partner_businesses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.group_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (SELECT 1 FROM public.partners partner WHERE partner.id = NEW.group_id::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.businesses business WHERE business.id = NEW.business_id AND business.partner_id = NEW.group_id::uuid) THEN
    RAISE EXCEPTION 'partner_group_business_mismatch' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.keep_partner_group_to_partner_businesses() FROM PUBLIC;

DROP TRIGGER IF EXISTS platform_key_businesses_keep_partner_group_before_write ON public.platform_key_businesses;
CREATE TRIGGER platform_key_businesses_keep_partner_group_before_write
BEFORE INSERT OR UPDATE ON public.platform_key_businesses
FOR EACH ROW
EXECUTE FUNCTION app.keep_partner_group_to_partner_businesses();

-- The partners' businesses made before this join their partners' groups.
INSERT INTO public.platform_key_businesses (business_id, group_id)
SELECT business.id, business.partner_id::text
FROM public.businesses business
WHERE business.partner_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Revoking a partner's key turns off the webhook endpoints it set up, on
-- every business, in the transaction that revokes it, so a leaked key stops
-- receiving data at once. The partner's owners and admins aren't on its
-- businesses' teams, so this reads every business's endpoints, and only for
-- an owner or admin of the key's partner once the key is revoked. Returns the
-- endpoints it turned off. Only lobbystack_app, which the console uses, may
-- call it.
CREATE OR REPLACE FUNCTION app.disable_revoked_partner_platform_key_webhooks(p_key_id uuid)
RETURNS TABLE (endpoint_id uuid, business_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's setting.
  IF NULLIF(current_setting('app.actor_type', true), '') IS DISTINCT FROM 'operator'
    OR NOT EXISTS (
      SELECT 1 FROM public.partner_platform_keys key
      WHERE key.id = p_key_id AND key.revoked_at IS NOT NULL AND app.partner_role(key.partner_id) IN ('owner', 'admin')
    ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH disabled AS (
    UPDATE public.webhook_endpoints endpoint
    SET status = 'disabled', disabled_reason = 'manual', disabled_at = now(), updated_at = now()
    WHERE endpoint.status = 'enabled' AND endpoint.created_by_platform_key_id = p_key_id
    RETURNING endpoint.id, endpoint.business_id
  ), audited AS (
    INSERT INTO public.audit_logs (business_id, actor_user_id, event_type, entity_type, entity_id, payload)
    SELECT disabled.business_id, app.current_user_id(), 'webhook_endpoint.disabled', 'webhook_endpoint', disabled.id, jsonb_build_object('reason', 'platform_key_revoked', 'platformKeyId', p_key_id)
    FROM disabled
    RETURNING entity_id, audit_logs.business_id
  )
  SELECT audited.entity_id, audited.business_id FROM audited;
END $$;
REVOKE ALL ON FUNCTION app.disable_revoked_partner_platform_key_webhooks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.disable_revoked_partner_platform_key_webhooks(uuid) TO lobbystack_app;

-- The admin calls this when it starts, with the ids of the keys in its
-- PLATFORM_API_KEYS, to turn off the endpoints a removed key set up. A key a
-- partner made counts as configured while it isn't revoked and still reaches
-- the business: the business is in the partner's group and still the
-- partner's. This reads that itself, in the statement that turns endpoints
-- off, so a key made while the admin starts keeps its endpoints too.
-- Everything else is as 0118 defined it.
CREATE OR REPLACE FUNCTION app.disable_removed_platform_key_webhooks(p_configured_key_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE disabled_count integer;
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's setting.
  IF NULLIF(current_setting('app.actor_type', true), '') IS DISTINCT FROM 'worker' OR p_configured_key_ids IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  WITH disabled AS (
    UPDATE public.webhook_endpoints endpoint
    SET status = 'disabled', disabled_reason = 'manual', disabled_at = now(), updated_at = now()
    WHERE endpoint.status = 'enabled'
      AND endpoint.created_by_platform_key_id IS NOT NULL
      AND NOT (endpoint.created_by_platform_key_id = ANY (p_configured_key_ids))
      AND NOT EXISTS (
        SELECT 1
        FROM public.partner_platform_keys key
        JOIN public.platform_key_businesses link ON link.group_id = key.partner_id::text
        JOIN public.businesses business ON business.id = link.business_id AND business.partner_id = key.partner_id
        WHERE key.id = endpoint.created_by_platform_key_id
          AND key.revoked_at IS NULL
          AND link.business_id = endpoint.business_id
      )
    RETURNING endpoint.id, endpoint.business_id, endpoint.created_by_platform_key_id
  ), audited AS (
    INSERT INTO public.audit_logs (business_id, event_type, entity_type, entity_id, payload)
    SELECT business_id, 'webhook_endpoint.disabled', 'webhook_endpoint', id, jsonb_build_object('reason', 'platform_key_removed', 'platformKeyId', created_by_platform_key_id)
    FROM disabled
    RETURNING 1
  )
  SELECT count(*)::integer INTO disabled_count FROM audited;
  RETURN disabled_count;
END $$;
REVOKE ALL ON FUNCTION app.disable_removed_platform_key_webhooks(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.disable_removed_platform_key_webhooks(uuid[]) TO lobbystack_worker;
