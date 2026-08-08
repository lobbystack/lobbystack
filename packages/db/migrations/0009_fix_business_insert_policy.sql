DROP POLICY IF EXISTS businesses_insert ON app.businesses;

CREATE POLICY businesses_insert ON app.businesses
  FOR INSERT
  WITH CHECK (
    app.is_platform_actor()
    OR owner_user_id::uuid = app.current_user_id()
  );
