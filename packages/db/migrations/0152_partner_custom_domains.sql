-- A partner on a paid tier connects its own subdomain, such as
-- app.acmeagency.com, on the console's Branding & domain page. The partner
-- adds it as pending; the worker registers it with the deployment's custom
-- hostname provider (Cloudflare for SaaS on the cloud, or the host's Caddy
-- with on-demand TLS), then checks it until the provider says it's active or
-- gives up. The DNS records the partner adds, and the provider's own errors,
-- are kept on the row for the console to show. Only the worker marks a
-- partner's domain verified, after the provider says so and the partner's
-- TXT record proves it controls the domain, and only then does the domain
-- carry the partner's brand. A partner has one domain of its own.

ALTER TABLE public.partner_domains
  -- Which provider set the domain up. A subdomain of the partner base domain has none.
  ADD COLUMN IF NOT EXISTS provider varchar(16) CHECK (provider IS NULL OR provider IN ('cloudflare', 'caddy')),
  -- The provider's id for the hostname, once the worker registered it.
  ADD COLUMN IF NOT EXISTS provider_hostname_id text CHECK (provider_hostname_id IS NULL OR char_length(provider_hostname_id) BETWEEN 1 AND 255),
  -- The records the partner adds at its DNS provider, as [{type, name, value, verified}].
  ADD COLUMN IF NOT EXISTS dns_records jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dns_records) = 'array'),
  -- What the provider last said is wrong, in its own words.
  ADD COLUMN IF NOT EXISTS provider_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(provider_errors) = 'array'),
  -- When the worker last asked the provider, and when the provider gave up on the domain.
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS added_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- The random value the partner publishes as a TXT record at
  -- _domain-verification.<hostname>. Only whoever controls the domain's DNS
  -- can add it, so a partner can't take a domain someone else pointed here.
  -- Every row gets its own, and only a partner's own domain uses it.
  ADD COLUMN IF NOT EXISTS verification_token varchar(64) NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') CHECK (verification_token ~ '^[0-9a-f]{32,64}$');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.partner_domains'::regclass AND conname = 'partner_domains_subdomain_has_no_provider') THEN
    ALTER TABLE public.partner_domains ADD CONSTRAINT partner_domains_subdomain_has_no_provider CHECK (kind = 'custom' OR (provider IS NULL AND provider_hostname_id IS NULL AND failed_at IS NULL));
  END IF;
END
$$;

-- A hostname answers for one partner at most, as 0128 had it, but only once
-- verified. Partners' claims on the same domain of their own wait side by
-- side until one proves it controls the domain, so nobody holds a domain from
-- its owner by claiming it first. A subdomain is verified when it's reserved.
CREATE UNIQUE INDEX IF NOT EXISTS partner_domains_verified_hostname_unique ON public.partner_domains (hostname) WHERE verified_at IS NOT NULL OR kind = 'subdomain';
CREATE INDEX IF NOT EXISTS partner_domains_hostname_idx ON public.partner_domains (hostname);
DROP INDEX IF EXISTS public.partner_domains_hostname_unique;

CREATE UNIQUE INDEX IF NOT EXISTS partner_domains_one_custom ON public.partner_domains (partner_id) WHERE kind = 'custom';
-- The worker's checks of the domains still waiting.
CREATE INDEX IF NOT EXISTS partner_domains_pending_custom_idx ON public.partner_domains (checked_at) WHERE kind = 'custom' AND verified_at IS NULL AND failed_at IS NULL;

-- The system actor adds a partner's subdomain, verified as signup reserves it,
-- and a partner's own domain only as pending, after the domain checked the
-- person's role and the partner's tier.
DROP POLICY IF EXISTS partner_domains_system_insert ON public.partner_domains;
CREATE POLICY partner_domains_system_insert ON public.partner_domains FOR INSERT
  WITH CHECK (
    app.current_actor_type() = 'system'
    AND (kind = 'subdomain' OR (verified_at IS NULL AND failed_at IS NULL AND provider_hostname_id IS NULL))
  );

-- The system actor still moves a partner's subdomain under a new partner base
-- domain. A partner's own domain changes only through the worker.
DROP POLICY IF EXISTS partner_domains_system_update ON public.partner_domains;
CREATE POLICY partner_domains_system_update ON public.partner_domains FOR UPDATE
  USING (app.current_actor_type() = 'system' AND kind = 'subdomain')
  WITH CHECK (app.current_actor_type() = 'system' AND kind = 'subdomain');

-- Removing a partner's own domain, after the domain checked the person's
-- role. A subdomain is never removed.
DROP POLICY IF EXISTS partner_domains_system_delete ON public.partner_domains;
CREATE POLICY partner_domains_system_delete ON public.partner_domains FOR DELETE
  USING (app.current_actor_type() = 'system' AND kind = 'custom');
GRANT DELETE ON public.partner_domains TO lobbystack_app;

-- The worker sets partners' own domains up with the provider, with no person
-- or business in its context, so it reaches every partner's own domain and
-- nothing else of partner_domains. It records what the provider says, and
-- never moves a domain to another partner or hostname or changes its token.
DROP POLICY IF EXISTS partner_domains_worker_read ON public.partner_domains;
CREATE POLICY partner_domains_worker_read ON public.partner_domains FOR SELECT
  TO lobbystack_worker
  USING (app.current_actor_type() = 'worker' AND kind = 'custom');
DROP POLICY IF EXISTS partner_domains_worker_update ON public.partner_domains;
CREATE POLICY partner_domains_worker_update ON public.partner_domains FOR UPDATE
  TO lobbystack_worker
  USING (app.current_actor_type() = 'worker' AND kind = 'custom')
  WITH CHECK (app.current_actor_type() = 'worker' AND kind = 'custom');
GRANT SELECT ON public.partner_domains TO lobbystack_worker;
GRANT UPDATE (provider_hostname_id, dns_records, provider_errors, checked_at, verified_at, failed_at, updated_at) ON public.partner_domains TO lobbystack_worker;

-- What a partner's pages and emails show of it, now with its own domain once
-- verified, which becomes its origin. A function's columns can't change in
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
  custom_domain varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT partner.name, partner.slug, subdomain.hostname, partner.logo_version, partner.favicon_version, partner.brand_color,
    partner.terms_url, partner.privacy_url, partner.support_url, partner.support_email, custom.hostname
  FROM public.partners partner
  LEFT JOIN public.partner_domains subdomain
    ON subdomain.partner_id = partner.id AND subdomain.kind = 'subdomain' AND subdomain.verified_at IS NOT NULL
  LEFT JOIN public.partner_domains custom
    ON custom.partner_id = partner.id AND custom.kind = 'custom' AND custom.verified_at IS NOT NULL
  WHERE partner.id = p_partner_id
$$;
REVOKE ALL ON FUNCTION app.partner_brand(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.partner_brand(uuid) TO lobbystack_app, lobbystack_worker;
