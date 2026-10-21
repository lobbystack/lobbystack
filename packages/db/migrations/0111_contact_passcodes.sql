-- A contact's keypad PIN. When a business requires one to change appointments
-- (verification mode passcode_required), callers type it on the phone keypad.
-- Only a salted scrypt hash of the PIN is kept, with the server's
-- OTP_HASH_SECRET in its input, so changing that secret makes every PIN stop
-- matching. It lives apart from contacts so the contact row the dashboard
-- reads never carries it.
CREATE TABLE IF NOT EXISTS public.contact_passcodes (
  contact_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  passcode_hash text NOT NULL,
  -- Wrong PINs in a row, across calls. Reaching the limit locks the PIN until
  -- someone at the business sets a new one.
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  set_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_passcodes_business_idx ON public.contact_passcodes(business_id);

ALTER TABLE public.contact_passcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_passcodes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_passcodes_tenant_isolation ON public.contact_passcodes;
CREATE POLICY contact_passcodes_tenant_isolation ON public.contact_passcodes
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_passcodes TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.contact_passcodes TO lobbystack_readonly;
