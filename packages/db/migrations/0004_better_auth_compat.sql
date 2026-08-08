-- Better Auth column compatibility (additive; preserves existing columns)

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image text;

UPDATE auth.users SET name = display_name WHERE name IS NULL AND display_name IS NOT NULL;
UPDATE auth.users SET email_verified = (email_verified_at IS NOT NULL) WHERE email_verified_at IS NOT NULL;

ALTER TABLE auth.sessions
  ADD COLUMN IF NOT EXISTS token text;

UPDATE auth.sessions SET token = session_token WHERE token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx ON auth.sessions (token);

ALTER TABLE auth.accounts
  ADD COLUMN IF NOT EXISTS account_id text,
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS password text,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz;

UPDATE auth.accounts SET account_id = provider_account_id WHERE account_id IS NULL;
UPDATE auth.accounts SET provider_id = provider WHERE provider_id IS NULL;

ALTER TABLE auth.verification_tokens
  ADD COLUMN IF NOT EXISTS value text;

UPDATE auth.verification_tokens SET value = token WHERE value IS NULL;

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
