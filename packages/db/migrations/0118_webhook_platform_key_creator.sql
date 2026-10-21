-- The PLATFORM_API_KEYS entry that created a webhook endpoint, or turned it
-- back on after it was off. The endpoint delivers only while that key is
-- configured and its partner still manages the business. Keys are not rows, so
-- this has no foreign key.
ALTER TABLE public.webhook_endpoints ADD COLUMN IF NOT EXISTS created_by_platform_key_id uuid;

-- The admin calls this when it starts, with the ids of the platform keys in its
-- PLATFORM_API_KEYS, to turn off the endpoints a removed key set up. The
-- webhook dispatcher doesn't read PLATFORM_API_KEYS, so it can't tell which
-- keys are gone. The request has no business context, so this reads every
-- business's endpoints. Only lobbystack_worker, which the admin's API uses, may
-- call it.
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
    UPDATE public.webhook_endpoints
    SET status = 'disabled', disabled_reason = 'manual', disabled_at = now(), updated_at = now()
    WHERE status = 'enabled'
      AND created_by_platform_key_id IS NOT NULL
      AND NOT (created_by_platform_key_id = ANY (p_configured_key_ids))
    RETURNING id, business_id, created_by_platform_key_id
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
