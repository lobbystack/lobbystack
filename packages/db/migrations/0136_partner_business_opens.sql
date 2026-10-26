-- A partner member works inside the partner's businesses without joining
-- their teams. They reach a business only by opening it, which records who
-- opened it and until when, here and in the business's audit log. Row-level
-- security checks the same open the application does: every tenant policy
-- asks app.has_business_membership, which now also answers true for an
-- unexpired open by someone still on the business's partner's team.

-- One row per person and business. Opening again moves the row's times
-- forward; the audit log keeps every open. A row names the business's own
-- partner, so releasing the business, or taking the person off the partner's
-- team, ends the access at once.
CREATE TABLE IF NOT EXISTS public.partner_business_opens (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (business_id, user_id),
  CHECK (expires_at > opened_at)
);
-- The workspace list reads a person's opens.
CREATE INDEX IF NOT EXISTS partner_business_opens_user_idx ON public.partner_business_opens (user_id, expires_at);

ALTER TABLE public.partner_business_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_business_opens FORCE ROW LEVEL SECURITY;

-- A person reads their own opens. Only the system actor, which
-- openPartnerBusiness runs as, writes one, and only for the current person on
-- a business of a partner whose team they're on.
DROP POLICY IF EXISTS partner_business_opens_self_read ON public.partner_business_opens;
CREATE POLICY partner_business_opens_self_read ON public.partner_business_opens FOR SELECT
  USING (app.current_actor_type() IN ('operator', 'system') AND user_id = app.current_user_id());
DROP POLICY IF EXISTS partner_business_opens_system_insert ON public.partner_business_opens;
CREATE POLICY partner_business_opens_system_insert ON public.partner_business_opens FOR INSERT
  WITH CHECK (app.current_actor_type() = 'system' AND user_id = app.current_user_id() AND partner_id = app.business_partner(business_id) AND app.partner_role(partner_id) IS NOT NULL);
DROP POLICY IF EXISTS partner_business_opens_system_update ON public.partner_business_opens;
CREATE POLICY partner_business_opens_system_update ON public.partner_business_opens FOR UPDATE
  USING (app.current_actor_type() = 'system' AND user_id = app.current_user_id())
  WITH CHECK (app.current_actor_type() = 'system' AND user_id = app.current_user_id() AND partner_id = app.business_partner(business_id) AND app.partner_role(partner_id) IS NOT NULL);

GRANT SELECT, INSERT ON public.partner_business_opens TO lobbystack_app;
-- Opening again only moves the times: no row moves to another business, person or partner.
GRANT UPDATE (opened_at, expires_at) ON public.partner_business_opens TO lobbystack_app;
GRANT SELECT ON public.partner_business_opens TO lobbystack_readonly;

-- The current person's role on the business's partner's team, while they
-- hold an unexpired open of the business and are still on that team, or null.
-- It answers only for the current person, so every runtime role may ask it:
-- the application checks a person's access with it on the worker's
-- connection too, as RLS does through app.has_partner_access.
CREATE OR REPLACE FUNCTION app.partner_access_role(target_business_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT member.role::text
  FROM public.partner_business_opens opened
  JOIN public.businesses business ON business.id = opened.business_id AND business.partner_id = opened.partner_id
  JOIN public.partner_members member ON member.partner_id = opened.partner_id AND member.user_id = opened.user_id AND member.status = 'active'
  WHERE opened.business_id = target_business_id
    AND opened.user_id = app.current_user_id()
    AND opened.expires_at > now()
$$;
REVOKE ALL ON FUNCTION app.partner_access_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_access_role(uuid) TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;

-- Whether the current person reaches the business through a partner open.
CREATE OR REPLACE FUNCTION app.has_partner_access(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT app.partner_access_role(target_business_id) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app.has_partner_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_partner_access(uuid) TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;

-- Whether the current person is on the business's own team, as
-- app.has_business_membership answered before partner opens. Functions that
-- act for the business's own people ask this instead.
CREATE OR REPLACE FUNCTION app.has_team_membership(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships membership
    WHERE membership.business_id = target_business_id
      AND membership.user_id = app.current_user_id()
      AND membership.status = 'active'
  )
$$;
REVOKE ALL ON FUNCTION app.has_team_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_team_membership(uuid) TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher, lobbystack_readonly;

-- Every tenant policy, and every function that checks the current person
-- through this, now lets a partner open in too. The team's own check comes
-- first and stays inline, so a member's rows cost what they did before.
-- Grants are as 0002 gave them.
CREATE OR REPLACE FUNCTION app.has_business_membership(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships membership
    WHERE membership.business_id = target_business_id
      AND membership.user_id = app.current_user_id()
      AND membership.status = 'active'
  ) OR app.has_partner_access(target_business_id)
$$;

-- The team list (app.list_business_members, 0079) needs no change: it lists
-- the business's own memberships only, so partner members never appear on it,
-- while one who opened the business can read it to support the team.

-- Verifying a phone sets the person's own phone, and in onboarding it
-- finishes a partner's business, whose calls forward to its owner's verified
-- phone. Operator alerts go only to the business's own team (0075). So only
-- the team verifies a phone in the business, never a partner open.
-- Everything else is as 0024 defined it.
CREATE OR REPLACE FUNCTION app.reserve_phone_verification_attempt(target_business_id uuid, target_user_id uuid, target_phone text, target_country text, target_line_type text, fingerprint text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
DECLARE attempt_id uuid;
BEGIN
  IF session_user <> 'lobbystack_app' OR NULLIF(current_setting('app.actor_type', true), '') <> 'operator' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_team_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.onboarding_phone_verifications WHERE user_id = target_user_id AND started_at >= now() - interval '1 hour') >= 5 THEN RAISE EXCEPTION 'verification_user_rate_limited' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(*) FROM public.onboarding_phone_verifications WHERE phone_e164 = target_phone AND started_at >= now() - interval '1 hour') >= 3 THEN RAISE EXCEPTION 'verification_phone_rate_limited' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.onboarding_phone_verifications WHERE user_id = target_user_id AND phone_e164 = target_phone AND started_at >= now() - interval '30 seconds') THEN RAISE EXCEPTION 'verification_cooldown' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.onboarding_phone_verifications(business_id,user_id,phone_e164,country_code,line_type,status,expires_at,request_fingerprint) VALUES(target_business_id,target_user_id,target_phone,target_country,target_line_type,'queued',now() + interval '10 minutes',fingerprint) RETURNING id INTO attempt_id;
  RETURN attempt_id;
END $$;
REVOKE ALL ON FUNCTION app.reserve_phone_verification_attempt(uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_phone_verification_attempt(uuid,uuid,text,text,text,text) TO lobbystack_app;

-- The same rule for finishing a verification. Everything else is as 0134
-- defined it.
CREATE OR REPLACE FUNCTION app.complete_phone_verification(target_business_id uuid, target_user_id uuid, target_attempt_id uuid, provider_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_catalog AS $$
BEGIN
  IF session_user <> 'lobbystack_app' OR target_user_id <> NULLIF(current_setting('app.user_id', true), '')::uuid OR target_business_id <> NULLIF(current_setting('app.business_id', true), '')::uuid OR NOT app.has_team_membership(target_business_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.onboarding_phone_verifications SET status = 'approved', approved_at = now(), updated_at = now(), last_error = NULL WHERE id = target_attempt_id AND business_id = target_business_id AND user_id = target_user_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.users SET phone = (SELECT phone_e164 FROM public.onboarding_phone_verifications WHERE id = target_attempt_id), phone_verified_at = now(), updated_at = now() WHERE id = target_user_id;
  UPDATE public.businesses SET onboarding_stage = CASE WHEN partner_id IS NULL THEN 'phone_number' ELSE 'complete' END, updated_at = now() WHERE id = target_business_id AND onboarding_stage = 'verify_phone';
  RETURN provider_status = 'approved';
END $$;
REVOKE ALL ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.complete_phone_verification(uuid,uuid,uuid,text) TO lobbystack_app;

-- The workspace list also gives the businesses the person has open through
-- their partner, with how they reach each one. Through an open they act with
-- an admin's role, since a partner member works there with full access but
-- isn't on the team. Adding a column changes the result type, which CREATE OR
-- REPLACE can't do. The team's rows are as 0134 defined them.
DROP FUNCTION IF EXISTS app.list_user_businesses(uuid);

CREATE FUNCTION app.list_user_businesses(p_user_id uuid)
RETURNS TABLE (
  business_id uuid,
  name text,
  slug varchar,
  role varchar,
  timezone varchar,
  business_type varchar,
  default_locale varchar,
  website_url text,
  onboarding_stage varchar,
  created_at timestamptz,
  partner_id uuid,
  partner_access_level varchar,
  access_via varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.id, business.name, business.slug, membership.role,
    business.timezone, business.business_type, business.default_locale,
    business.website_url, business.onboarding_stage, business.created_at,
    business.partner_id, business.partner_access_level, 'membership'::varchar
  FROM public.business_memberships membership
  INNER JOIN public.businesses business ON business.id = membership.business_id
  WHERE membership.user_id = p_user_id
    AND p_user_id = app.current_user_id()
    AND membership.status = 'active'
    AND business.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.prospect_demos demo
      WHERE demo.business_id = business.id
        AND demo.operator_user_id = p_user_id
        AND demo.claimed_by_user_id IS DISTINCT FROM p_user_id
        AND (demo.status IN ('revoked', 'claimed') OR demo.expires_at <= now())
    )
  UNION ALL
  SELECT business.id, business.name, business.slug, 'business_admin'::varchar,
    business.timezone, business.business_type, business.default_locale,
    business.website_url, business.onboarding_stage, business.created_at,
    business.partner_id, business.partner_access_level, 'partner'::varchar
  FROM public.partner_business_opens opened
  INNER JOIN public.businesses business ON business.id = opened.business_id AND business.partner_id = opened.partner_id
  INNER JOIN public.partner_members member ON member.partner_id = opened.partner_id AND member.user_id = opened.user_id AND member.status = 'active'
  WHERE opened.user_id = p_user_id
    AND p_user_id = app.current_user_id()
    AND opened.expires_at > now()
    AND business.status = 'active'
    -- Someone on the team as well reaches it through the team.
    AND NOT EXISTS (
      SELECT 1
      FROM public.business_memberships own
      WHERE own.business_id = business.id
        AND own.user_id = p_user_id
        AND own.status = 'active'
    )
  ORDER BY 2, 1
$$;

REVOKE ALL ON FUNCTION app.list_user_businesses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_user_businesses(uuid) TO lobbystack_app;

-- A partner's business may have no member yet while the partner sets it up,
-- and its partner's people work in it through opens, not the team. So a
-- partner open in the last 30 days also makes a business active. Everything
-- else is as 0090 defined it.
CREATE OR REPLACE FUNCTION app.list_scheduler_businesses()
RETURNS TABLE (business_id uuid, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT b.id,
    (
      EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.business_id = b.id AND m.status = 'active')
      AND (
        b.onboarding_stage = 'complete'
        OR EXISTS (SELECT 1 FROM public.calls c WHERE c.business_id = b.id AND c.started_at > now() - interval '30 days')
        OR EXISTS (SELECT 1 FROM public.messages msg WHERE msg.business_id = b.id AND msg.created_at > now() - interval '30 days')
        OR EXISTS (
          SELECT 1
          FROM public.business_memberships m
          JOIN public.sessions s ON s.user_id = m.user_id
          WHERE m.business_id = b.id
            AND m.status = 'active'
            AND greatest(s.created_at, s.updated_at) > now() - interval '30 days'
        )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.partner_business_opens opened
      WHERE opened.business_id = b.id
        AND opened.partner_id = b.partner_id
        AND opened.opened_at > now() - interval '30 days'
    )
  FROM public.businesses b
  WHERE session_user = 'lobbystack_dispatcher'
    AND NULLIF(current_setting('app.actor_type', true), '') = 'dispatcher'
$$;

REVOKE ALL ON FUNCTION app.list_scheduler_businesses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_scheduler_businesses() TO lobbystack_dispatcher;
