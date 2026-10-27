-- What a partner's pages and emails show of it, now with its logo's content
-- type. Gmail and Outlook don't show SVG images, so an email heads with the
-- partner's name instead of an SVG logo. A function's columns can't change in
-- place. Code that reads the earlier columns keeps working.
DROP FUNCTION IF EXISTS app.partner_brand(uuid);
CREATE FUNCTION app.partner_brand(p_partner_id uuid)
RETURNS TABLE (
  name text,
  slug varchar,
  subdomain varchar,
  logo_version text,
  favicon_version text,
  brand_color varchar,
  terms_url text,
  privacy_url text,
  support_url text,
  support_email varchar,
  custom_domain varchar,
  logo_content_type varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT partner.name, partner.slug, subdomain.hostname, partner.logo_version, partner.favicon_version, partner.brand_color,
    partner.terms_url, partner.privacy_url, partner.support_url, partner.support_email, custom.hostname, partner.logo_content_type
  FROM public.partners partner
  LEFT JOIN public.partner_domains subdomain
    ON subdomain.partner_id = partner.id AND subdomain.kind = 'subdomain' AND subdomain.verified_at IS NOT NULL
  LEFT JOIN public.partner_domains custom
    ON custom.partner_id = partner.id AND custom.kind = 'custom' AND custom.verified_at IS NOT NULL
  WHERE partner.id = p_partner_id
$$;
REVOKE ALL ON FUNCTION app.partner_brand(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_brand(uuid) TO lobbystack_app, lobbystack_worker;

-- The addresses of a partner's business's owners, for the email that tells
-- them their partner released or deleted it. People see only their own row in
-- users, so this reads past that: for the partner's owners and admins while
-- the business is still the partner's, and for the worker in a transaction
-- scoped to that business, when the host deletes a lapsed partner's
-- businesses.
CREATE OR REPLACE FUNCTION app.partner_business_owner_emails(p_business_id uuid)
RETURNS TABLE (email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT person.email::text
  FROM public.business_memberships membership
  JOIN public.users person ON person.id = membership.user_id
  JOIN public.businesses business ON business.id = membership.business_id
  WHERE membership.business_id = p_business_id
    AND membership.role = 'business_owner'
    AND membership.status = 'active'
    AND business.partner_id IS NOT NULL
    -- Inside SECURITY DEFINER current_user is the owner, so app.current_actor_type()
    -- would read 'none'; read the settings the transaction set instead.
    AND (
      (current_setting('app.actor_type', true) IN ('operator', 'system') AND app.partner_role(business.partner_id) IN ('owner', 'admin'))
      OR (current_setting('app.actor_type', true) = 'worker' AND NULLIF(current_setting('app.business_id', true), '')::uuid = p_business_id)
    )
$$;
REVOKE ALL ON FUNCTION app.partner_business_owner_emails(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_business_owner_emails(uuid) TO lobbystack_app, lobbystack_worker;

-- Whether the partner released a business the signed-in person still owns,
-- so the partner's domain can send them to the host's dashboard, where it
-- runs now. The release's audit log row lives in that business, which RLS
-- shows only in its own transaction, so this reads past that for the
-- person's own releases and answers nothing else.
CREATE OR REPLACE FUNCTION app.partner_released_business_to_me(p_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audit_logs entry
    JOIN public.business_memberships membership
      ON membership.business_id = entry.business_id
      AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND membership.role = 'business_owner'
      AND membership.status = 'active'
    JOIN public.businesses business ON business.id = entry.business_id AND business.partner_id IS NULL
    WHERE entry.event_type = 'partner.business_released'
      AND entry.payload->>'partnerId' = p_partner_id::text
  )
$$;
REVOKE ALL ON FUNCTION app.partner_released_business_to_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_released_business_to_me(uuid) TO lobbystack_app;
