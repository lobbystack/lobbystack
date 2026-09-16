CREATE SCHEMA IF NOT EXISTS app;

GRANT USAGE ON SCHEMA app TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.business_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_actor_type()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'none')
    WHEN 'operator' THEN CASE WHEN current_user = 'lobbystack_app' THEN 'operator' ELSE 'none' END
    WHEN 'system' THEN CASE WHEN current_user = 'lobbystack_app' THEN 'system' ELSE 'none' END
    WHEN 'worker' THEN CASE WHEN current_user = 'lobbystack_worker' THEN 'worker' ELSE 'none' END
    WHEN 'dispatcher' THEN CASE WHEN current_user = 'lobbystack_dispatcher' THEN 'dispatcher' ELSE 'none' END
    ELSE 'none'
  END
$$;

CREATE OR REPLACE FUNCTION app.has_business_membership(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships membership
    WHERE membership.business_id = target_business_id
      AND membership.user_id = app.current_user_id()
      AND membership.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION app.can_access_business(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
  SELECT target_business_id = app.current_business_id()
    AND app.has_business_membership(target_business_id)
$$;

REVOKE ALL ON FUNCTION app.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_business_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_actor_type() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.has_business_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_access_business(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
GRANT EXECUTE ON FUNCTION app.current_business_id() TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
GRANT EXECUTE ON FUNCTION app.current_actor_type() TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
GRANT EXECUTE ON FUNCTION app.has_business_membership(uuid) TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
GRANT EXECUTE ON FUNCTION app.can_access_business(uuid) TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;

DO $$
DECLARE
  table_name text;
  auth_table_name text;
  tenant_tables text[] := ARRAY[
    'businesses', 'business_memberships', 'business_invitations', 'staff', 'services',
    'staff_service_assignments', 'business_hours', 'closures', 'phone_numbers',
    'onboarding_phone_verifications', 'onboarding_number_claim_events',
    'receptionist_profiles', 'contacts', 'conversations', 'conversation_sessions',
    'messages', 'calls', 'transcripts', 'appointments', 'appointment_change_verifications',
    'knowledge_documents', 'knowledge_chunks', 'knowledge_snippets', 'agent_rules',
    'website_ingestion_jobs', 'business_context_snapshots', 'storage_objects',
    'calendar_connections', 'calendar_busy_blocks', 'notifications', 'billing_accounts',
    'billing_usage_events', 'billing_transactions', 'compliance_records', 'affiliate_attributions',
    'affiliate_voided_sources', 'audit_logs',
    'idempotency_keys', 'provider_events', 'outbox_messages', 'product_events'
  ];
  auth_tables text[] := ARRAY['users', 'accounts', 'sessions', 'verifications'];
BEGIN
  FOREACH auth_table_name IN ARRAY auth_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', auth_table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', auth_table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_auth_access ON public.%I', auth_table_name, auth_table_name);
    EXECUTE format(
      'CREATE POLICY %I_auth_access ON public.%I TO lobbystack_auth USING (true) WITH CHECK (true)',
      auth_table_name, auth_table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_auth', auth_table_name);
  END LOOP;

  ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS users_self_access ON public.users;
  CREATE POLICY users_self_access ON public.users
    FOR ALL TO lobbystack_app
    USING (id = app.current_user_id())
    WITH CHECK (id = app.current_user_id());
  GRANT SELECT (id, platform_role, active_business_id), UPDATE (active_business_id, updated_at) ON public.users TO lobbystack_app;

  ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.affiliate_profiles FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS affiliate_profiles_access ON public.affiliate_profiles;
  CREATE POLICY affiliate_profiles_access ON public.affiliate_profiles
    FOR ALL TO lobbystack_app
    USING (app.current_actor_type() = 'system' OR user_id = app.current_user_id())
    WITH CHECK (app.current_actor_type() = 'system' OR user_id = app.current_user_id());
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_profiles TO lobbystack_app;

  FOREACH table_name IN ARRAY tenant_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON public.%I', table_name, table_name);
    IF table_name = 'businesses' THEN
      EXECUTE format(
        'CREATE POLICY %I_tenant_isolation ON public.%I USING (app.can_access_business(id) OR (app.current_actor_type() IN (''system'', ''worker'') AND id = app.current_business_id())) WITH CHECK ((app.current_actor_type() IN (''system'', ''worker'') AND id = app.current_business_id()) OR app.can_access_business(id))',
        table_name, table_name
      );
    ELSIF table_name IN ('business_memberships', 'business_invitations') THEN
      EXECUTE format(
        'CREATE POLICY %I_tenant_isolation ON public.%I USING ((app.current_actor_type() = ''system'' AND business_id = app.current_business_id()) OR (business_id = app.current_business_id() AND (app.current_actor_type() IN (''worker'', ''dispatcher'') OR app.has_business_membership(business_id)))) WITH CHECK ((app.current_actor_type() = ''system'' AND business_id = app.current_business_id()) OR (business_id = app.current_business_id() AND (app.current_actor_type() IN (''worker'', ''dispatcher'') OR app.has_business_membership(business_id))))',
        table_name, table_name
      );
    ELSIF table_name IN ('outbox_messages', 'provider_events') THEN
      EXECUTE format(
        'CREATE POLICY %I_tenant_isolation ON public.%I USING (app.current_actor_type() IN (''system'', ''dispatcher'') OR (business_id = app.current_business_id() AND (app.current_actor_type() IN (''worker'', ''dispatcher'') OR app.has_business_membership(business_id)))) WITH CHECK (app.current_actor_type() IN (''system'', ''dispatcher'') OR (business_id = app.current_business_id() AND (app.current_actor_type() IN (''worker'', ''dispatcher'') OR app.has_business_membership(business_id))))',
        table_name, table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I_tenant_isolation ON public.%I USING (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id))) WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN (''system'', ''worker'', ''dispatcher'') OR app.has_business_membership(business_id)))',
        table_name, table_name
      );
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO lobbystack_app, lobbystack_worker', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO lobbystack_readonly', table_name);
  END LOOP;
END
$$;

DROP POLICY IF EXISTS businesses_dispatcher_select ON public.businesses;
CREATE POLICY businesses_dispatcher_select ON public.businesses
  FOR SELECT TO lobbystack_dispatcher
  USING (app.current_actor_type() = 'dispatcher');
GRANT SELECT ON public.businesses TO lobbystack_dispatcher;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users, public.accounts, public.sessions, public.verifications TO lobbystack_auth;
GRANT SELECT (id, active_business_id), UPDATE (active_business_id) ON public.users TO lobbystack_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lobbystack_auth, lobbystack_app, lobbystack_worker, lobbystack_dispatcher;
