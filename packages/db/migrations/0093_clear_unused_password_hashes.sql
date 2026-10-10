-- Sign-in checks accounts.password. users.password_hash was a copy that
-- nothing read, and a password change from the account page never updated
-- it, so it could keep an old hash. The app no longer writes it; clear it.
--
-- users forces row-level security, so this needs a role that sees every row,
-- like 0088. Running this file again changes nothing.
DO $$
DECLARE
  cleared integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE NOTICE 'Skipping the users.password_hash cleanup: % is subject to row-level security.', current_user;
    RETURN;
  END IF;

  UPDATE public.users SET password_hash = NULL WHERE password_hash IS NOT NULL;
  GET DIAGNOSTICS cleared = ROW_COUNT;

  RAISE NOTICE 'Users: % unused password hash copies cleared.', cleared;
END
$$;
