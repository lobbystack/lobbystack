-- The app name and logo this deployment shows in place of LobbyStack. Its
-- first owner picks them in onboarding, and BRAND_APP_NAME and BRAND_LOGO_URL
-- on the admin win over them field by field. The table holds at most one row;
-- a null column leaves that field to the environment or the default.
CREATE TABLE IF NOT EXISTS public.deployment_branding (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_name text CHECK (app_name IS NULL OR char_length(app_name) BETWEEN 1 AND 40),
  logo bytea CHECK (logo IS NULL OR octet_length(logo) BETWEEN 1 AND 262144),
  logo_content_type varchar(32) CHECK (logo_content_type IS NULL OR logo_content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  -- Changes whenever the logo does, so the logo's URL can be cached for good.
  logo_version text GENERATED ALWAYS AS (encode(sha256(logo), 'hex')) STORED,
  saved_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((logo IS NULL) = (logo_content_type IS NULL))
);

ALTER TABLE public.deployment_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_branding FORCE ROW LEVEL SECURITY;
-- Every page shows the branding, signed in or not, so every runtime role may
-- read it. Nothing writes it except app.save_initial_branding below.
DROP POLICY IF EXISTS deployment_branding_read ON public.deployment_branding;
CREATE POLICY deployment_branding_read ON public.deployment_branding FOR SELECT USING (true);
GRANT SELECT ON public.deployment_branding TO lobbystack_app, lobbystack_worker, lobbystack_readonly;

-- The deployment's name and logo are chosen once, in onboarding, by someone
-- who owns every business on it. On a fresh deployment there are no
-- businesses yet, so the first person to sign up chooses. Nobody on a
-- deployment that already serves someone else's business can.
CREATE OR REPLACE FUNCTION app.can_save_initial_branding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT app.current_user_id() IS NOT NULL
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'operator'
    -- The check below must see every business. Refuse rather than allow if
    -- row level security would hide some from this function's owner.
    AND (SELECT owner.rolsuper OR owner.rolbypassrls FROM pg_catalog.pg_roles owner WHERE owner.rolname = current_user)
    AND NOT EXISTS (SELECT 1 FROM public.deployment_branding)
    AND NOT EXISTS (
      SELECT 1
      FROM public.businesses business
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.business_memberships membership
        WHERE membership.business_id = business.id
          AND membership.user_id = app.current_user_id()
          AND membership.role = 'business_owner'
          AND membership.status = 'active'
      )
    )
$$;

REVOKE ALL ON FUNCTION app.can_save_initial_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_save_initial_branding() TO lobbystack_app;

-- Saves the choice and answers 'saved', 'already_saved' when someone chose
-- first, or 'not_allowed'. Null arguments leave a field to the default.
CREATE OR REPLACE FUNCTION app.save_initial_branding(p_app_name text, p_logo bytea, p_logo_content_type text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  saved_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.deployment_branding) THEN
    RETURN 'already_saved';
  END IF;
  IF NOT app.can_save_initial_branding() THEN
    RETURN 'not_allowed';
  END IF;
  INSERT INTO public.deployment_branding (id, app_name, logo, logo_content_type, saved_by_user_id)
  VALUES (1, p_app_name, p_logo, p_logo_content_type, app.current_user_id())
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS saved_count = ROW_COUNT;
  RETURN CASE WHEN saved_count = 1 THEN 'saved' ELSE 'already_saved' END;
END;
$$;

REVOKE ALL ON FUNCTION app.save_initial_branding(text, bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.save_initial_branding(text, bytea, text) TO lobbystack_app;
