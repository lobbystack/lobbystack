ALTER TABLE auth.sessions
  ALTER COLUMN session_token DROP NOT NULL;

CREATE OR REPLACE FUNCTION auth.sync_session_legacy_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_token IS NULL AND NEW.token IS NOT NULL THEN
    NEW.session_token := NEW.token;
  END IF;
  IF NEW.token IS NULL AND NEW.session_token IS NOT NULL THEN
    NEW.token := NEW.session_token;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_sync_legacy_token ON auth.sessions;
CREATE TRIGGER sessions_sync_legacy_token
  BEFORE INSERT OR UPDATE ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION auth.sync_session_legacy_token();
