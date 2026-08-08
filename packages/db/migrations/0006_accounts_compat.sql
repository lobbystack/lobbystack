ALTER TABLE auth.accounts
  ALTER COLUMN provider DROP NOT NULL,
  ALTER COLUMN provider_account_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION auth.sync_account_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider IS NULL AND NEW.provider_id IS NOT NULL THEN
    NEW.provider := NEW.provider_id;
  END IF;
  IF NEW.provider_account_id IS NULL AND NEW.account_id IS NOT NULL THEN
    NEW.provider_account_id := NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_sync_legacy_columns ON auth.accounts;
CREATE TRIGGER accounts_sync_legacy_columns
  BEFORE INSERT OR UPDATE ON auth.accounts
  FOR EACH ROW
  EXECUTE FUNCTION auth.sync_account_legacy_columns();
