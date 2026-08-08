-- RLS migration: helper functions, session context, and tenant isolation policies

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.business_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_actor_type()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.actor_type', true), '');
$$;

CREATE OR REPLACE FUNCTION app.is_platform_actor()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_actor_type() IN ('system', 'worker', 'dispatcher');
$$;

CREATE OR REPLACE FUNCTION app.set_session_context(
  p_user_id uuid,
  p_business_id uuid,
  p_actor_type text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.business_id', COALESCE(p_business_id::text, ''), true);
  PERFORM set_config('app.actor_type', COALESCE(p_actor_type, ''), true);
END;
$$;

CREATE OR REPLACE FUNCTION app.tenant_matches(business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.is_platform_actor()
    OR (app.current_business_id() IS NOT NULL AND business_id = app.current_business_id());
$$;

GRANT EXECUTE ON FUNCTION app.current_user_id() TO
  lobbystack_auth, lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
GRANT EXECUTE ON FUNCTION app.current_business_id() TO
  lobbystack_auth, lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
GRANT EXECUTE ON FUNCTION app.current_actor_type() TO
  lobbystack_auth, lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
GRANT EXECUTE ON FUNCTION app.is_platform_actor() TO
  lobbystack_auth, lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;
GRANT EXECUTE ON FUNCTION app.set_session_context(uuid, uuid, text) TO
  lobbystack_auth, lobbystack_app, lobbystack_worker, lobbystack_dispatcher;
GRANT EXECUTE ON FUNCTION app.tenant_matches(uuid) TO
  lobbystack_auth, lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;

DO $$
DECLARE
  tenant_table text;
  tenant_tables text[] := ARRAY[
    'memberships',
    'invitations',
    'business_settings',
    'setup_guide_progress',
    'staff',
    'services',
    'staff_services',
    'business_hours',
    'closures',
    'phone_numbers',
    'receptionist_profiles',
    'appointments',
    'appointment_verifications',
    'appointment_audit_logs',
    'contacts',
    'conversations',
    'messages',
    'conversation_sessions',
    'calls',
    'call_transcripts',
    'call_events',
    'knowledge_documents',
    'knowledge_chunks',
    'knowledge_snippets',
    'agent_rules',
    'context_snapshots',
    'website_scrape_jobs',
    'calendar_connections',
    'calendar_sync_events',
    'external_calendar_blocks',
    'notification_preferences',
    'notification_deliveries',
    'push_subscriptions',
    'billing_accounts',
    'billing_subscriptions',
    'billing_addons',
    'usage_records',
    'unit_economics_events',
    'sms_compliance_profiles',
    'sms_consent_states',
    'sms_consent_events',
    'data_retention_policies',
    'outbox_messages',
    'workflow_jobs',
    'audit_logs',
    'storage_objects',
    'idempotency_keys'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', tenant_table);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON app.%I', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON app.%I', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON app.%I', tenant_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON app.%I', tenant_table);

    EXECUTE format(
      'CREATE POLICY tenant_isolation_select ON app.%I FOR SELECT USING (app.tenant_matches(business_id))',
      tenant_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_insert ON app.%I FOR INSERT WITH CHECK (app.tenant_matches(business_id))',
      tenant_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_update ON app.%I FOR UPDATE USING (app.tenant_matches(business_id)) WITH CHECK (app.tenant_matches(business_id))',
      tenant_table
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_delete ON app.%I FOR DELETE USING (app.tenant_matches(business_id))',
      tenant_table
    );
  END LOOP;
END
$$;

ALTER TABLE app.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.businesses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS businesses_select ON app.businesses;
DROP POLICY IF EXISTS businesses_update ON app.businesses;

CREATE POLICY businesses_select ON app.businesses
  FOR SELECT
  USING (
    app.is_platform_actor()
    OR id = app.current_business_id()
    OR EXISTS (
      SELECT 1
      FROM app.memberships m
      WHERE m.business_id = businesses.id
        AND m.user_id = app.current_user_id()::text
        AND m.status = 'active'
    )
  );

CREATE POLICY businesses_update ON app.businesses
  FOR UPDATE
  USING (
    app.is_platform_actor()
    OR (
      id = app.current_business_id()
      AND EXISTS (
        SELECT 1
        FROM app.memberships m
        WHERE m.business_id = businesses.id
          AND m.user_id = app.current_user_id()::text
          AND m.role IN ('owner', 'admin')
          AND m.status = 'active'
      )
    )
  )
  WITH CHECK (
    app.is_platform_actor()
    OR id = app.current_business_id()
  );

ALTER TABLE app.affiliate_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.affiliate_partners FORCE ROW LEVEL SECURITY;
ALTER TABLE app.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.affiliate_referrals FORCE ROW LEVEL SECURITY;
ALTER TABLE app.affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.affiliate_commissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_platform_read ON app.affiliate_partners;
CREATE POLICY affiliate_platform_read ON app.affiliate_partners
  FOR SELECT
  USING (app.is_platform_actor());

DROP POLICY IF EXISTS affiliate_referral_read ON app.affiliate_referrals;
CREATE POLICY affiliate_referral_read ON app.affiliate_referrals
  FOR SELECT
  USING (
    app.is_platform_actor()
    OR business_id::text = app.current_business_id()::text
  );

DROP POLICY IF EXISTS affiliate_commission_read ON app.affiliate_commissions;
CREATE POLICY affiliate_commission_read ON app.affiliate_commissions
  FOR SELECT
  USING (
    app.is_platform_actor()
    OR business_id::text = app.current_business_id()::text
  );

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_self_access ON auth.users;
CREATE POLICY users_self_access ON auth.users
  FOR ALL
  USING (
    app.is_platform_actor()
    OR id::text = app.current_user_id()::text
  )
  WITH CHECK (
    app.is_platform_actor()
    OR id::text = app.current_user_id()::text
  );
