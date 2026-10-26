-- A partner resells LobbyStack to businesses under its own brand. It has a
-- team of partner members (owners, admins and members), invitations to that
-- team, and the domains its brand answers on. A person reaches only the
-- partners whose team they're on. Partner signup, accepting an invitation and
-- sending one run as the system actor, because the person isn't on the team
-- yet or the email it queues belongs to no business.

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- The partner's handle, and the label of its subdomain under the partner
  -- base domain, so it follows DNS rules (isPartnerSlug in packages/shared).
  slug varchar(40) NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' AND slug NOT LIKE 'xn--%'),
  status varchar(32) NOT NULL DEFAULT 'active',
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partners_slug_unique ON public.partners (slug);

CREATE TABLE IF NOT EXISTS public.partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  -- A removed member keeps the row, so accepting a new invitation brings them back.
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_members_partner_user_unique ON public.partner_members (partner_id, user_id);
CREATE INDEX IF NOT EXISTS partner_members_user_idx ON public.partner_members (user_id) WHERE status = 'active';

-- Invitations to a partner's team. Only a hash of each link's token is kept.
CREATE TABLE IF NOT EXISTS public.partner_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  -- Deleting the account that sent an invitation deletes the invitation, so its link stops working.
  invited_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  normalized_email text NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  token_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at timestamptz NOT NULL,
  accepted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_invitations_token_hash_unique ON public.partner_invitations (token_hash);
CREATE INDEX IF NOT EXISTS partner_invitations_partner_status_idx ON public.partner_invitations (partner_id, status);

-- The hostnames a partner's brand answers on. Signup reserves the partner's
-- subdomain of the partner base domain, already verified. A hostname belongs
-- to one partner at most, whatever its kind.
CREATE TABLE IF NOT EXISTS public.partner_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  hostname varchar(253) NOT NULL CHECK (hostname = lower(hostname) AND hostname <> ''),
  kind varchar(16) NOT NULL CHECK (kind IN ('subdomain', 'custom')),
  -- When the hostname was shown to point at this deployment, or null while it waits.
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_domains_hostname_unique ON public.partner_domains (hostname);
CREATE UNIQUE INDEX IF NOT EXISTS partner_domains_one_subdomain ON public.partner_domains (partner_id) WHERE kind = 'subdomain';

-- While partner signup is invite-only, the host lets a company in with one of
-- these, made by `pnpm partner-invite:create`. Each works once, for the email
-- it names.
CREATE TABLE IF NOT EXISTS public.partner_signup_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  normalized_email text NOT NULL,
  token_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at timestamptz NOT NULL,
  accepted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- The partner signing up with it created.
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_signup_invitations_token_hash_unique ON public.partner_signup_invitations (token_hash);

-- The current person's role on a partner's team, or null when they aren't on
-- it. The policies below ask this instead of reading partner_members
-- themselves, which would run partner_members' own policy again.
CREATE OR REPLACE FUNCTION app.partner_role(target_partner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT member.role::text
  FROM public.partner_members member
  WHERE member.partner_id = target_partner_id
    AND member.user_id = app.current_user_id()
    AND member.status = 'active'
$$;
REVOKE ALL ON FUNCTION app.partner_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_role(uuid) TO lobbystack_app, lobbystack_worker, lobbystack_readonly;

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_domains FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_signup_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_signup_invitations FORCE ROW LEVEL SECURITY;

-- Partner members see their own partners. Only the system actor creates one.
DROP POLICY IF EXISTS partners_member_read ON public.partners;
CREATE POLICY partners_member_read ON public.partners FOR SELECT
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(id) IS NOT NULL));
DROP POLICY IF EXISTS partners_system_insert ON public.partners;
CREATE POLICY partners_system_insert ON public.partners FOR INSERT
  WITH CHECK (app.current_actor_type() = 'system');

-- A partner's members see its team. Owners and admins change it, and only
-- through the columns granted below; the domain decides which changes need an
-- owner, and keeps a partner's last owner.
DROP POLICY IF EXISTS partner_members_member_read ON public.partner_members;
CREATE POLICY partner_members_member_read ON public.partner_members FOR SELECT
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IS NOT NULL));
DROP POLICY IF EXISTS partner_members_system_insert ON public.partner_members;
CREATE POLICY partner_members_system_insert ON public.partner_members FOR INSERT
  WITH CHECK (app.current_actor_type() = 'system');
DROP POLICY IF EXISTS partner_members_admin_update ON public.partner_members;
CREATE POLICY partner_members_admin_update ON public.partner_members FOR UPDATE
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')))
  WITH CHECK (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')));

DROP POLICY IF EXISTS partner_invitations_member_read ON public.partner_invitations;
CREATE POLICY partner_invitations_member_read ON public.partner_invitations FOR SELECT
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IS NOT NULL));
DROP POLICY IF EXISTS partner_invitations_system_insert ON public.partner_invitations;
CREATE POLICY partner_invitations_system_insert ON public.partner_invitations FOR INSERT
  WITH CHECK (app.current_actor_type() = 'system');
DROP POLICY IF EXISTS partner_invitations_admin_update ON public.partner_invitations;
CREATE POLICY partner_invitations_admin_update ON public.partner_invitations FOR UPDATE
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')))
  WITH CHECK (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin')));

DROP POLICY IF EXISTS partner_domains_member_read ON public.partner_domains;
CREATE POLICY partner_domains_member_read ON public.partner_domains FOR SELECT
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IS NOT NULL));
DROP POLICY IF EXISTS partner_domains_system_insert ON public.partner_domains;
CREATE POLICY partner_domains_system_insert ON public.partner_domains FOR INSERT
  WITH CHECK (app.current_actor_type() = 'system');

-- The host makes signup invitations and signup claims them, both as the system actor.
DROP POLICY IF EXISTS partner_signup_invitations_system_access ON public.partner_signup_invitations;
CREATE POLICY partner_signup_invitations_system_access ON public.partner_signup_invitations
  USING (app.current_actor_type() = 'system')
  WITH CHECK (app.current_actor_type() = 'system');

GRANT SELECT, INSERT ON public.partners TO lobbystack_app;
GRANT SELECT, INSERT ON public.partner_members, public.partner_invitations, public.partner_signup_invitations TO lobbystack_app;
-- Updates reach only the columns partner operations write. Nobody, an admin
-- included, can move a row to another partner or person, or change who sent
-- an invitation, the role it grants, its token or its expiry.
GRANT UPDATE (role, status, updated_at) ON public.partner_members TO lobbystack_app;
GRANT UPDATE (status, accepted_by_user_id, accepted_at, updated_at) ON public.partner_invitations TO lobbystack_app;
GRANT UPDATE (status, accepted_by_user_id, partner_id, accepted_at, updated_at) ON public.partner_signup_invitations TO lobbystack_app;
GRANT SELECT, INSERT ON public.partner_domains TO lobbystack_app;
GRANT SELECT ON public.partners, public.partner_members, public.partner_invitations, public.partner_domains, public.partner_signup_invitations TO lobbystack_readonly;

-- The Team page lists a partner's members with their names and emails.
-- users_self_access lets the app role read only its own users row, so this
-- answers instead, and only an operator on that partner's team.
CREATE OR REPLACE FUNCTION app.list_partner_members(p_partner_id uuid)
RETURNS TABLE (member_id uuid, user_id uuid, name text, email text, role varchar, joined_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT member.id, person.id, person.name, person.email, member.role, member.created_at
  FROM public.partner_members member
  JOIN public.users person ON person.id = member.user_id
  WHERE member.partner_id = p_partner_id
    AND member.status = 'active'
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; only lobbystack_app can execute this, so read the setting.
    AND current_setting('app.actor_type', true) = 'operator'
    AND app.partner_role(p_partner_id) IS NOT NULL
  ORDER BY member.created_at, member.id
$$;
REVOKE ALL ON FUNCTION app.list_partner_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_partner_members(uuid) TO lobbystack_app;

-- What a partner's emails show of it. The worker sends them with no person
-- or business in its context, so it reads the partner here, as pages read
-- deployment_branding. Only the name a partner's emails carry anyway.
CREATE OR REPLACE FUNCTION app.partner_brand(p_partner_id uuid)
RETURNS TABLE (name text, slug varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT partner.name, partner.slug FROM public.partners partner WHERE partner.id = p_partner_id
$$;
REVOKE ALL ON FUNCTION app.partner_brand(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_brand(uuid) TO lobbystack_app, lobbystack_worker;

-- A business's partner, now that partners exist (0127 added the column
-- without a key). Deleting a partner doesn't take its businesses with it:
-- they're released or deleted one by one first. NOT VALID, so this file
-- doesn't read every business while it holds the lock that blocks them; 0130
-- validates the key under a lighter lock. New and changed rows are checked
-- from now on.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.businesses'::regclass AND conname = 'businesses_partner_id_fkey') THEN
    ALTER TABLE public.businesses ADD CONSTRAINT businesses_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) NOT VALID;
  END IF;
END
$$;
