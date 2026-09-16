CREATE OR REPLACE FUNCTION app.set_normalized_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.normalized_email = lower(btrim(NEW.email));
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS users_normalized_email_before_write ON public.users;
CREATE TRIGGER users_normalized_email_before_write
BEFORE INSERT OR UPDATE OF email ON public.users
FOR EACH ROW
EXECUTE FUNCTION app.set_normalized_user_email();

CREATE OR REPLACE FUNCTION app.list_user_businesses(p_user_id uuid)
RETURNS TABLE (business_id uuid, name text, slug varchar, role varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.slug, membership.role
  FROM public.business_memberships membership
  INNER JOIN public.businesses business ON business.id = membership.business_id
  WHERE membership.user_id = p_user_id
    AND p_user_id = app.current_user_id()
    AND membership.status = 'active'
    AND business.status = 'active'
  ORDER BY business.name
$$;

REVOKE ALL ON FUNCTION app.list_user_businesses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_user_businesses(uuid) TO lobbystack_app;
