-- Passkeys (WebAuthn credentials) for signing in without a password.
--
-- Better Auth's passkey plugin reads and writes this table with the
-- lobbystack_auth role, like the other sign-in tables. One row is one
-- credential on one device or password manager. credential_id is what the
-- browser presents at sign-in. counter and backed_up are kept as the plugin
-- reports them. Deleting a user deletes their passkeys.
CREATE TABLE IF NOT EXISTS public.passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  public_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  counter integer NOT NULL,
  device_type text NOT NULL,
  backed_up boolean NOT NULL,
  transports text,
  aaguid text,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS passkeys_credential_id_unique ON public.passkeys(credential_id);
CREATE INDEX IF NOT EXISTS passkeys_user_idx ON public.passkeys(user_id);

ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkeys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS passkeys_auth_access ON public.passkeys;
CREATE POLICY passkeys_auth_access ON public.passkeys TO lobbystack_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passkeys TO lobbystack_auth;
