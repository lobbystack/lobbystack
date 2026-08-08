-- INSERT ... RETURNING evaluates SELECT policies on the returned rows.
-- Allow business owners to read businesses they own during bootstrap.

DROP POLICY IF EXISTS businesses_owner_select ON app.businesses;
CREATE POLICY businesses_owner_select ON app.businesses
  FOR SELECT
  USING (owner_user_id::uuid = app.current_user_id());

DROP POLICY IF EXISTS businesses_insert ON app.businesses;
CREATE POLICY businesses_insert ON app.businesses
  FOR INSERT
  WITH CHECK (
    app.is_platform_actor()
    OR owner_user_id::uuid = app.current_user_id()
  );
