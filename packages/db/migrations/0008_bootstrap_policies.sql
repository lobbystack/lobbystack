-- Bootstrap policies for business creation and user-scoped membership reads.

CREATE POLICY businesses_insert ON app.businesses
  FOR INSERT
  WITH CHECK (
    app.is_platform_actor()
    OR owner_user_id::uuid = app.current_user_id()
  );

CREATE POLICY businesses_owner_select ON app.businesses
  FOR SELECT
  USING (owner_user_id::uuid = app.current_user_id());

CREATE POLICY memberships_self_select ON app.memberships
  FOR SELECT
  USING (user_id = app.current_user_id()::text);

CREATE POLICY memberships_bootstrap_insert ON app.memberships
  FOR INSERT
  WITH CHECK (
    app.is_platform_actor()
    OR app.tenant_matches(business_id)
    OR (
      app.current_user_id() IS NOT NULL
      AND user_id = app.current_user_id()::text
      AND EXISTS (
        SELECT 1
        FROM app.businesses b
        WHERE b.id = memberships.business_id
          AND b.owner_user_id = app.current_user_id()::text
      )
    )
  );

CREATE POLICY billing_accounts_bootstrap_insert ON app.billing_accounts
  FOR INSERT
  WITH CHECK (
    app.is_platform_actor()
    OR app.tenant_matches(business_id)
    OR EXISTS (
      SELECT 1
      FROM app.businesses b
      WHERE b.id = billing_accounts.business_id
        AND b.owner_user_id = app.current_user_id()::text
    )
  );

CREATE POLICY outbox_messages_bootstrap_insert ON app.outbox_messages
  FOR INSERT
  WITH CHECK (
    app.is_platform_actor()
    OR app.tenant_matches(business_id)
    OR EXISTS (
      SELECT 1
      FROM app.businesses b
      WHERE b.id = outbox_messages.business_id
        AND b.owner_user_id = app.current_user_id()::text
    )
  );
