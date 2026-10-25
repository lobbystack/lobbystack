-- Platform keys group the businesses they create under a group, so "partner"
-- means only a reseller (ADR 0010). The table that links a group's keys to
-- their businesses, its column, constraints, index and policy take the new
-- name. Rows, grants and row-level security carry over with the rename, and an
-- existing partner slug becomes that group's id, so every key keeps reaching
-- the same businesses.
ALTER TABLE public.platform_partner_businesses RENAME TO platform_key_businesses;
ALTER TABLE public.platform_key_businesses RENAME COLUMN partner_id TO group_id;
ALTER TABLE public.platform_key_businesses RENAME CONSTRAINT platform_partner_businesses_pkey TO platform_key_businesses_pkey;
ALTER TABLE public.platform_key_businesses RENAME CONSTRAINT platform_partner_businesses_business_id_fkey TO platform_key_businesses_business_id_fkey;
ALTER INDEX public.platform_partner_businesses_partner_idx RENAME TO platform_key_businesses_group_idx;
ALTER POLICY platform_partner_businesses_tenant_isolation ON public.platform_key_businesses RENAME TO platform_key_businesses_tenant_isolation;
ALTER TABLE public.platform_key_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_key_businesses FORCE ROW LEVEL SECURITY;

-- GET /v1/businesses lists the businesses a platform key's group onboarded, as
-- the function this replaces did: one group's active businesses, newest first,
-- one page at a time. Its body named the old table and its parameter the
-- partner, which CREATE OR REPLACE can't rename, so it is dropped and made
-- again. Only the worker role, which serves /api/v1, may call it.
DROP FUNCTION IF EXISTS app.list_platform_partner_businesses(text, timestamptz, uuid, integer);
CREATE OR REPLACE FUNCTION app.list_platform_key_businesses(p_group_id text, p_before_created timestamptz, p_before_id uuid, p_limit integer)
RETURNS TABLE (business_id uuid, name text, timezone varchar, default_locale varchar, website_url text, onboarding_stage varchar, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.timezone, business.default_locale, business.website_url, business.onboarding_stage, business.created_at
  FROM public.platform_key_businesses link
  JOIN public.businesses business ON business.id = link.business_id
  WHERE link.group_id = p_group_id
    AND business.status = 'active'
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_worker can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'worker'
    -- Keyset paging on the millisecond value, as the API's cursors carry it.
    AND (p_before_created IS NULL OR (date_trunc('milliseconds', business.created_at), business.id) < (p_before_created, p_before_id))
  ORDER BY date_trunc('milliseconds', business.created_at) DESC, business.id DESC
  -- The API bounds the page size; this only refuses a zero or negative limit.
  LIMIT GREATEST(p_limit, 1)
$$;

REVOKE ALL ON FUNCTION app.list_platform_key_businesses(text, timestamptz, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_platform_key_businesses(text, timestamptz, uuid, integer) TO lobbystack_worker;

-- Accepting a claim link still removes the links that let a group's platform
-- keys reach the business. Only the table's name changes from migration 0117.
CREATE OR REPLACE FUNCTION app.finish_business_handover(p_business_id uuid, p_sender_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  -- Inside SECURITY DEFINER current_user is the owner, so read the caller's settings.
  IF NULLIF(current_setting('app.actor_type', true), '') IS DISTINCT FROM 'system'
    OR p_business_id IS DISTINCT FROM NULLIF(current_setting('app.business_id', true), '')::uuid
    OR NOT EXISTS (SELECT 1 FROM public.business_invitations WHERE business_id = p_business_id AND invited_by_user_id = p_sender_user_id AND transfers_ownership AND status = 'accepted') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.platform_key_businesses WHERE business_id = p_business_id;
  UPDATE public.users SET active_business_id = NULL, updated_at = now() WHERE id = p_sender_user_id AND active_business_id = p_business_id;
END $$;
REVOKE ALL ON FUNCTION app.finish_business_handover(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.finish_business_handover(uuid, uuid) TO lobbystack_app;

-- A release runs this migration before it deploys the worker and the admin,
-- and a rollback can put the previous admin back on this schema. That admin
-- still reads and writes platform_partner_businesses.partner_id and calls
-- app.list_platform_partner_businesses, so both stay as thin aliases of the
-- new names. The view runs as its caller, so the table's grants and its
-- row-level security policy still decide what each role sees and changes, and
-- it is simple enough for PostgreSQL to accept the old INSERT, ON CONFLICT DO
-- NOTHING and DELETE through it. Drop both once no admin older than this
-- migration can run.
CREATE VIEW public.platform_partner_businesses WITH (security_invoker = true) AS
  SELECT business_id, group_id AS partner_id, created_by_platform_key_id, created_at
  FROM public.platform_key_businesses;
REVOKE ALL ON public.platform_partner_businesses FROM PUBLIC;
GRANT SELECT ON public.platform_partner_businesses TO lobbystack_app, lobbystack_readonly;
GRANT SELECT, INSERT, DELETE ON public.platform_partner_businesses TO lobbystack_worker;

CREATE FUNCTION app.list_platform_partner_businesses(p_partner_id text, p_before_created timestamptz, p_before_id uuid, p_limit integer)
RETURNS TABLE (business_id uuid, name text, timezone varchar, default_locale varchar, website_url text, onboarding_stage varchar, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT * FROM app.list_platform_key_businesses(p_partner_id, p_before_created, p_before_id, p_limit)
$$;
REVOKE ALL ON FUNCTION app.list_platform_partner_businesses(text, timestamptz, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_platform_partner_businesses(text, timestamptz, uuid, integer) TO lobbystack_worker;
