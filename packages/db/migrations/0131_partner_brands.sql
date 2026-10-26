-- A partner's brand: the name, logo, favicon, color and links its domains,
-- sign-in pages and emails show. Owners and admins set it on the console's
-- Branding & domain page. Visitors to a partner's domain see it before anyone
-- signs in, and the worker reads it with no person in its context, so both
-- read it through the functions below: the partners table shows its rows only
-- to the partner's own members.

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS logo bytea CHECK (logo IS NULL OR octet_length(logo) BETWEEN 1 AND 262144),
  ADD COLUMN IF NOT EXISTS logo_content_type varchar(32) CHECK (logo_content_type IS NULL OR logo_content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  -- Changes whenever the image does, so its URL can be cached for good.
  ADD COLUMN IF NOT EXISTS logo_version text GENERATED ALWAYS AS (encode(sha256(logo), 'hex')) STORED,
  ADD COLUMN IF NOT EXISTS favicon bytea CHECK (favicon IS NULL OR octet_length(favicon) BETWEEN 1 AND 262144),
  ADD COLUMN IF NOT EXISTS favicon_content_type varchar(32) CHECK (favicon_content_type IS NULL OR favicon_content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  ADD COLUMN IF NOT EXISTS favicon_version text GENERATED ALWAYS AS (encode(sha256(favicon), 'hex')) STORED,
  ADD COLUMN IF NOT EXISTS brand_color varchar(7) CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9a-f]{6}$'),
  ADD COLUMN IF NOT EXISTS terms_url text CHECK (terms_url IS NULL OR (char_length(terms_url) <= 2048 AND terms_url ~ '^https?://')),
  ADD COLUMN IF NOT EXISTS privacy_url text CHECK (privacy_url IS NULL OR (char_length(privacy_url) <= 2048 AND privacy_url ~ '^https?://')),
  ADD COLUMN IF NOT EXISTS support_url text CHECK (support_url IS NULL OR (char_length(support_url) <= 2048 AND support_url ~ '^https?://')),
  -- Where replies to the partner's emails go, and its support link when it has no page.
  ADD COLUMN IF NOT EXISTS support_email varchar(254) CHECK (support_email IS NULL OR support_email ~ '^[^\s@<>"]+@[^\s@<>"]+$');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.partners'::regclass AND conname = 'partners_logo_typed') THEN
    ALTER TABLE public.partners ADD CONSTRAINT partners_logo_typed CHECK ((logo IS NULL) = (logo_content_type IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.partners'::regclass AND conname = 'partners_favicon_typed') THEN
    ALTER TABLE public.partners ADD CONSTRAINT partners_favicon_typed CHECK ((favicon IS NULL) = (favicon_content_type IS NULL));
  END IF;
END
$$;

-- Owners and admins change the partner's name and brand, and only through the
-- columns granted below: nobody changes its slug, status or creator this way.
DROP POLICY IF EXISTS partners_admin_update ON public.partners;
CREATE POLICY partners_admin_update ON public.partners FOR UPDATE
  USING (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(id) IN ('owner', 'admin')))
  WITH CHECK (app.current_actor_type() = 'system' OR (app.current_actor_type() = 'operator' AND app.partner_role(id) IN ('owner', 'admin')));
GRANT UPDATE (name, logo, logo_content_type, favicon, favicon_content_type, brand_color, terms_url, privacy_url, support_url, support_email, updated_at) ON public.partners TO lobbystack_app;

-- When the host changes PARTNER_BASE_DOMAIN, the system actor moves each
-- partner's subdomain row under the new one, since a partner keeps one
-- subdomain. Nobody else changes a domain row, and no row moves to another
-- partner or kind.
DROP POLICY IF EXISTS partner_domains_system_update ON public.partner_domains;
CREATE POLICY partner_domains_system_update ON public.partner_domains FOR UPDATE
  USING (app.current_actor_type() = 'system')
  WITH CHECK (app.current_actor_type() = 'system');
GRANT UPDATE (hostname, verified_at, updated_at) ON public.partner_domains TO lobbystack_app;

-- What a partner's pages and emails show of it, with its subdomain. 0128
-- returned only the name and slug, and a function's columns can't change in
-- place. Code that reads only the name keeps working.
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
  support_email varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT partner.name, partner.slug, domain.hostname, partner.logo_version, partner.favicon_version, partner.brand_color,
    partner.terms_url, partner.privacy_url, partner.support_url, partner.support_email
  FROM public.partners partner
  LEFT JOIN public.partner_domains domain
    ON domain.partner_id = partner.id AND domain.kind = 'subdomain' AND domain.verified_at IS NOT NULL
  WHERE partner.id = p_partner_id
$$;
REVOKE ALL ON FUNCTION app.partner_brand(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_brand(uuid) TO lobbystack_app, lobbystack_worker;

-- A partner's saved logo or favicon, for the admin to serve to anyone: they
-- show on its sign-in pages and in its emails, before anyone signs in.
CREATE OR REPLACE FUNCTION app.partner_brand_image(p_partner_id uuid, p_image text)
RETURNS TABLE (image bytea, content_type varchar, version text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    CASE p_image WHEN 'logo' THEN partner.logo ELSE partner.favicon END,
    CASE p_image WHEN 'logo' THEN partner.logo_content_type ELSE partner.favicon_content_type END,
    CASE p_image WHEN 'logo' THEN partner.logo_version ELSE partner.favicon_version END
  FROM public.partners partner
  WHERE partner.id = p_partner_id
    AND p_image IN ('logo', 'favicon')
    AND CASE p_image WHEN 'logo' THEN partner.logo IS NOT NULL ELSE partner.favicon IS NOT NULL END
$$;
REVOKE ALL ON FUNCTION app.partner_brand_image(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_brand_image(uuid, text) TO lobbystack_app;

-- The partner a verified hostname belongs to, and its kind, for answering a
-- request before anyone signs in. Brands decides whether a subdomain row still
-- counts under the current partner base domain.
CREATE OR REPLACE FUNCTION app.partner_for_host(p_hostname text)
RETURNS TABLE (partner_id uuid, kind varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT domain.partner_id, domain.kind
  FROM public.partner_domains domain
  WHERE domain.hostname = lower(p_hostname)
    AND domain.verified_at IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app.partner_for_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_for_host(text) TO lobbystack_app;

-- A business's partner, or null for a direct business, so its emails and pages
-- take the partner's brand. The worker asks with no business in its context.
CREATE OR REPLACE FUNCTION app.business_partner(p_business_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT business.partner_id FROM public.businesses business WHERE business.id = p_business_id
$$;
REVOKE ALL ON FUNCTION app.business_partner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.business_partner(uuid) TO lobbystack_app, lobbystack_worker;
