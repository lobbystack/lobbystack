# Brand a deployment

A self-hosted deployment can show its own app name and logo instead of LobbyStack, and send its outside links to its own website. This page covers how to set them, how the admin picks which to show, and where the LobbyStack brand still appears, with the variable proposed for each of those places. Partners on a deployment set brands of their own, which show on their domains instead, as [Partner brands](#partner-brands) describes.

## LobbyStack by default

Every branding variable is empty in `.env.example`, `Dockerfile.admin`, and `docker-compose.yml`. A build that sets none of them looks like LobbyStack:

- The name LobbyStack and LobbyStack's mark in the tab, above sign-in and onboarding, and in dashboard text.
- Links to `https://lobbystack.com`, its `/terms` and `/privacy` pages, and `https://docs.lobbystack.com`.
- LobbyStack's contact addresses in the feedback panel, the Enterprise contact button, and the SMS HELP replies.

A self-hosted deployment's first owner can still pick a name and logo in onboarding, as described in [The onboarding step](#the-onboarding-step).

### LobbyStack's cloud

With `DEPLOYMENT_MODE=cloud`, onboarding never shows the brand step, and `POST /api/branding/initial` answers 403 with the code `branding_not_allowed`. Cloud customers sign up on LobbyStack's own deployment, so none of them may rename it. The environment variables still apply on the cloud, and LobbyStack's cloud leaves them unset.

## Set the name and logo

The admin reads two settings. For each one it uses the first of these that has a value:

1. The admin's environment: `BRAND_APP_NAME` and `BRAND_LOGO_URL`.
2. The choice the deployment's first owner saved during onboarding. It's stored as one row in `public.deployment_branding`.
3. LobbyStack's own name and mark.

Each setting is resolved on its own, so an operator can fix the name in the environment and still let the first owner upload a logo. The environment comes first so that whoever runs a deployment keeps control of it: the first person to sign up can't replace a name the operator already set, and an operator can fix the branding without database access. Prerendered pages can only read the environment the admin was built with, so it has to be available at build time as well (see [Prerendered pages](#prerendered-pages)).

| Setting | Environment variable | Accepted values |
| --- | --- | --- |
| App name | `BRAND_APP_NAME` | 1 to 40 characters once whitespace is collapsed. Control and format characters, such as bidirectional overrides, aren't allowed. |
| Logo | `BRAND_LOGO_URL` | An `https://` URL without credentials, or a path on the dashboard such as `/brand/logo.svg`. |

When a variable is set to a value it can't use, the admin logs a warning once and treats the variable as unset.

Set the variables on the admin service. Give them to the admin's Docker build too: `Dockerfile.admin` and `docker-compose.yml` pass build arguments with the same names. On Railway, the admin's service variables reach its Docker build automatically.

### The onboarding step

The first owner sees a **Make this app your own** step right after sign-up, before naming their business. The rest of onboarding follows in its usual order: the website, knowledge, greeting, test call, phone verification, and number steps. The brand step shares step 2 of the progress dots with the business step. It asks only for the fields the environment leaves unset, and it doesn't appear at all when both are set. The owner can type a name, upload a logo, or skip. Skipping saves an empty row, which keeps LobbyStack and ends the choice.

The admin shows the step only when all of these hold. `app.can_save_initial_branding()` checks the last two in the database, and `app.save_initial_branding()` checks them again when the owner saves:

- `DEPLOYMENT_MODE` isn't `cloud`.
- The person is on the host's own domain, not a partner's host, since the step names the host's deployment.
- Nobody has saved branding yet.
- The person owns every business on the deployment. A fresh deployment has no businesses, so the first person to sign up qualifies. Someone on a deployment that already serves another person's business never does.

`requireOnboardingStage()` in `apps/admin/src/lib/onboarding-route.ts` sends that person from `/onboarding/business` to `/onboarding/brand` while they have no business yet, and `requireBrandStep()` sends everyone else on to their current step.

Uploaded logos can be PNG, JPEG, WebP, or SVG files of up to 256 KB. The admin works out the type from the file's bytes rather than its name. It refuses any SVG that contains script, event handlers, `foreignObject`, embedded documents, or entity declarations. That check is a blocklist, and character references such as `&#x6A;avascript:` can get past it. The real defense is the response header: the logo route serves every saved logo under `Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox` with `X-Content-Type-Options: nosniff`, so an image opened on its own can't run anything. `apps/admin/app/api/branding/logo/route.test.ts` checks both headers on every response.

### Change the branding later

There's no settings page for this yet. To change the branding:

- Set `BRAND_APP_NAME` or `BRAND_LOGO_URL` and redeploy the admin. They take priority over the saved choice.
- Or delete the saved row as the database superuser, because the runtime roles can't write the table, and open `/onboarding/brand` as the owner of every business:

  ```sql
  DELETE FROM public.deployment_branding;
  ```

The admin caches the branding for 30 seconds. Saving it in onboarding also tells the other admin replicas and the worker through Redis, as [How a change reaches every process](#how-a-change-reaches-every-process) describes.

## Where the name and logo appear

- The browser tab's title and icon on every admin page: the dashboard, sign-in and sign-up, onboarding, and the website widget's frame.
- The logo and name above the sign-in, sign-up, password reset, invitation, email change, verification, OAuth consent, and onboarding pages.
- The header of the public demo page.
- The instructions of a prospect demo's receptionist, which name the brand that made the demo.
- Every dashboard string in all four languages that used to say LobbyStack: 22 strings, which now use the `{{appName}}` i18n variable.
- The opening of the SMS HELP replies, such as `Acme Desk: For help, contact …`. Text messages read the name the same way the admin does, from `BRAND_APP_NAME` and then the saved choice (`deploymentAppName()` in `packages/domain/src/server/branding.ts`).

A deployment still named LobbyStack with no logo of its own shows LobbyStack's mark. A renamed deployment with no logo shows its name on its own, so LobbyStack's mark never appears beside another name.

## Send the outside links to your own site

The admin also links to pages outside itself: the website, the terms of service and privacy policy, the docs, and an address to write to. Five variables point them at a deployment's own site and inbox.

| Link | Environment variable | Accepted values | When unset |
| --- | --- | --- | --- |
| Website | `NEXT_PUBLIC_LANDING_SITE_URL` | An `http://` or `https://` URL without credentials, a query, or a fragment. | `https://lobbystack.com` |
| Terms of service | `NEXT_PUBLIC_TERMS_URL` | An `http://` or `https://` URL without credentials. | `/terms` on the website |
| Privacy policy | `NEXT_PUBLIC_PRIVACY_URL` | An `http://` or `https://` URL without credentials. | `/privacy` on the website |
| Docs | `NEXT_PUBLIC_DOCS_SITE_URL` | Like the website. | `https://docs.lobbystack.com` |
| Contact address | `NEXT_PUBLIC_CONTACT_EMAIL` | A plain address, such as `support@example.com`. | LobbyStack's address for each place: `support@lobbystack.com` in the feedback panel, `hello@lobbystack.ai` for Enterprise plans, and `hello@lobbystack.com` in text messages. |

An empty variable counts as unset. When a variable holds a value it can't use, the admin logs a warning at startup and uses LobbyStack's link in its place.

Where each one appears:

- **Website**: the logo on the public demo page, the "visit" link in the SMS HELP reply, and the terms and privacy links when their own variables are unset. On lobbystack.com the links open the page in the reader's language, under `/fr/`, `/es/`, or `/sr/`. Any other site gets the same path in every language, such as `/terms`.
- **Terms and privacy**: the links under the sign-up form and at the foot of onboarding, and the affiliate program's terms link. With `NEXT_PUBLIC_TERMS_URL` set, the affiliate link opens the top of that page, since only LobbyStack's terms have an `#affiliate-program` section.
- **Docs**: the "see docs" and Help Center links in the dashboard's feedback panel, the call forwarding guide linked after checkout, and `resource_documentation` in the MCP server's OAuth metadata, which adds `/ai/mcp`. On docs.lobbystack.com the forwarding guide opens in French or Spanish for those readers. Any other docs site gets the same path in every language.
- **Contact address**: the feedback panel's "Contact us" link, the Enterprise plan's contact button in onboarding and billing, and both SMS HELP replies. The HELP reply is part of the registered A2P 10DLC campaign, so update the campaign when the address or the website changes.

### Set them for the build

Next.js writes `NEXT_PUBLIC_` variables into the admin's build, both the browser's code and the server's, so a change takes a rebuild. `next.config.ts` fixes all five at build time, even the unset ones, so a value set only when the admin starts can't make the server render one link and the browser another.

`Dockerfile.admin` and `docker-compose.yml` pass build arguments with the same names. On Railway, the admin's service variables reach its Docker build automatically.

`packages/shared/src/brandLinks.ts` holds the variable names, the checks, and LobbyStack's defaults. `apps/admin/src/lib/marketing-site-url.ts` builds the website, terms, and privacy links.

## Partner brands

A partner's owners and admins set its brand on the partner console's **Branding & domain** page, at `/partner/<partner id>/branding`. Members see the page but can't save it. Pages on the partner's domains and the partner's emails use the brand in place of the host's name, logo, and links. What a partner leaves empty stays empty: its pages never show the host's logo or links instead.

| Field | Accepted values |
| --- | --- |
| Name | 1 to 80 characters once whitespace is collapsed. Control and format characters aren't allowed. |
| Logo | A PNG, JPEG, WebP, or SVG file of up to 256 KB, checked the way onboarding checks the host's logo. |
| Favicon | Like the logo. Without one, the tab shows the logo. |
| Brand color | A hex code such as `#0f766e`, saved in lowercase. |
| Terms, privacy, and support links | `http://` or `https://` URLs without credentials, up to 2,048 characters. An empty field hides its link. |
| Support email | A plain address. Replies to the partner's emails go to it, and the support link opens it when the partner has no support page. |

The brand lives on `public.partners` (migration 0131). Owners and admins write it through column grants and a row level security policy, so nobody changes a partner's slug that way. Visitors and the worker have no partner membership, so they read the brand through `app.partner_brand()`, and the admin serves the images through `app.partner_brand_image()`. `GET /api/branding/logo?partner=<partner id>` serves a partner's logo, and `&image=favicon` its favicon, under the same sandboxed policy as the host's logo.

### Which brand a hostname gets

The admin's proxy (`apps/admin/proxy.ts`) resolves each request's `Host` header before any page or route runs. It ignores the header's case, a trailing dot, and the port:

- **The host's own domain** gets the host brand, without a database read to decide it: the hostname in `APP_BASE_URL`, the plain origins in `AUTH_TRUSTED_ORIGINS`, and the hosts in `MARKETING_HOSTS`. Outside production, `localhost`, `127.0.0.1`, `[::1]`, and the hosts in `ALLOWED_DEV_ORIGINS` count too.
- **A partner's subdomain** of `PARTNER_BASE_DOMAIN`, such as `acme.receptionistportal.com`, gets that partner's brand through `resolveHostBrand`. So does the partner's own domain, such as `app.acmeagency.com`, once the worker verified it and while the deployment issues certificates for partners' domains, as [A partner's own domain](#a-partners-own-domain) describes.
- **Any other hostname** gets a plain `404 Not found.` for every page and route. A subdomain left under an earlier `PARTNER_BASE_DOMAIN` counts as any other hostname. Brands reads the database only for a subdomain directly under `PARTNER_BASE_DOMAIN`, or for any hostname once partners can add their own domains, so it refuses `127.0.0.1` in production or a made-up hostname without a database read.

Health checks (`/api/health/*`), provider webhooks (`/api/webhooks/*`), the finance export (`/api/internal/*`), and Caddy's TLS ask (`/api/tls/ask`) answer on any hostname, because machines call them on the address they were given: `127.0.0.1:3000` for the Docker and Compose health checks, `admin:3000` for Compose's Caddy, and an ngrok tunnel for webhooks in development. They render no brand. The proxy never resolves a health check's or the TLS ask's hostname, so a slow database can't fail a probe and get the container replaced.

When the database can't say whether a hostname belongs to a partner, the proxy answers `503`, so no page goes out under the wrong brand. The host's own domain never needs the database to resolve. When the admin can't read the host brand's saved choice, those pages fall back to the environment's.

If you reach a self-hosted deployment on a hostname outside that list, such as the server's IP address or a LAN name, you now get the 404. To keep that hostname, add its origin, such as `http://192.0.2.10:3000`, to `AUTH_TRUSTED_ORIGINS`.

#### The brand header

The proxy deletes any `x-lobbystack-brand` and `x-lobbystack-brand-origin` header a client sends, on every request, the marketing site's included. Then it sets its own:

- `x-lobbystack-brand: host` on the host's own domain.
- `x-lobbystack-brand: partner:<partner id>` on a partner's host, with `x-lobbystack-brand-origin` holding the origin the visitor used, such as `https://acme.receptionistportal.com`.

Pages and routes read the brand from these headers through `loadRequestBrand`, `requireRequestBrand`, and `loadRequestEmailBrand` in `apps/admin/src/lib/branding.ts`, and never from the `Host` header. A request with neither header, such as a health check on `127.0.0.1`, has no brand.

The checks that trust a browser's origin read the same headers. On the host's domain they trust the host's configured origins, as before. On a partner's host they trust only the origin the proxy resolved:

- Better Auth, on every `/api/auth` request, as [Signing in on a partner's host](#signing-in-on-a-partners-host) describes.
- The proxy's CSRF check on changes to `/api/*`.
- The verification-code resend proof (`hasVerificationFlow`).
- The dashboard's test call (`resolveLiveWebCallAccess`).
- Turnstile, which accepts a token on a partner's host only when the visitor solved the challenge on that same hostname. List `PARTNER_BASE_DOMAIN` among the Turnstile widget's hostnames in Cloudflare, or partners' visitors can't solve it. Invitations link to the partner's subdomain, so sign-up works there. Add a partner's own domain to the list too if people should sign up on it.

A partner's host answers a 404 for what stays on the host's domain: MCP (`/api/mcp`), the OAuth server and its `/.well-known/` documents (Better Auth's copies under `/api/auth/.well-known/` included), the OAuth consent pages, the OpenAPI document (`/api/v1/openapi.json`), provider webhooks, the finance export, the host's onboarding brand step (`POST /api/branding/initial`), and partner signup (`/partner/signup`).

A partner's business gets its partner's brand from `brandForBusiness`, and a direct business gets the host's. Text messages keep calling `deploymentAppName()`, so a partner's name never reaches them.

### A partner's pages

Every page on a partner's host shows the partner's brand: the tab's title and favicon, the logo and name above sign-in and onboarding, the `{{appName}}` variable in dashboard text, and the website widget's frame. The partner's color replaces the dashboard's primary color, with light or dark text on it, whichever reads better. The terms, privacy, and support links come from the partner, and its pages leave out any link it didn't set. Sign-in, sign-up, and onboarding list them below the form, and the dashboard's account menu lists them too. Sign-up shows its agreement line only when the partner set both terms and privacy links. The dashboard leaves out the host's Help Center and docs links, since partners have no docs of their own.

On a partner's host, the partner console opens only that partner. `/partner` goes to its console, and anyone off its team gets a 404 there, since partner signup stays on the host's domain. Another partner's console sends the visitor back to `/partner`, the switcher lists no other partner, and `/api/partner/*` answers 404 for any other partner. The dashboard's account menu links to the console only for that partner's team.

A partner's prospect demos open on its host too, at `/demo`, under its brand. Their receptionist names the partner, never the host. The page's header shows the partner's logo with no link, since the host's site is the only one it could open, and leaves out the host's free trial. The demo page, its web call, and claiming the demo answer a token from another brand's demo as they answer an unknown one, on the host's domain and on every partner's host.

A partner's pages never send its visitors to a host-named domain:

- PostHog never starts there, so browser analytics and error reports stay off.
- Knowledge uploads go to `PUT /api/uploads/content` on the partner's own origin, and the admin passes each file on to storage. The bucket's CORS rules list only the host's origins.

### Signing in on a partner's host

People sign up, sign in, verify their email, reset their password, and change their email on a partner's host, under the partner's brand. Better Auth (`apps/admin/src/lib/auth.ts`) reads the brand headers the proxy set:

- **Trusted origins**: a request on a partner's host trusts only that host's origin, both for its `Origin` header and for any callback URL it names. A request on the host's domain trusts `APP_BASE_URL` and `AUTH_TRUSTED_ORIGINS`, as before, and a request with no brand header trusts none. Better Auth adds every host it can build links on to the origins it trusts, so a small plugin narrows each request back to what the proxy resolved, and one partner's host never trusts another's.
- **Links**: with `PARTNER_BASE_DOMAIN` set, Better Auth builds its links on the partner's subdomain for a request there, with the scheme of `APP_BASE_URL`. A partner's own domain joins the hosts Better Auth builds links on when the proxy resolves a request to it, and leaves 30 seconds after its last request, so a removed domain drops out once no process answers it. Every other hostname gets `APP_BASE_URL`, so the OAuth issuer stays put. The links the admin adds itself use the same origin: the sign-in and reset links sent to an address that already has an account, and the email change confirmation page. Sign-up verification and password reset codes carry no link. Better Auth's link reset answers 404, so no reset token ever goes to a host a partner controls.
- **Sessions**: a session cookie belongs to the hostname that set it, so someone who works on a partner's host and on the host's domain signs in on each, with the same account and password.
- **Google**: a partner's host offers email and password only, because Google's consent screen would name the host's app. `GET /api/auth/providers` answers `{ "google": false }` there, and Better Auth answers a 404 for `/api/auth/sign-in/social`, `/api/auth/link-social`, and `/api/auth/callback/google`. The host's domain keeps Google sign-in when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

Code that calls Better Auth's handler itself, as the OAuth consent page does, sets the host's brand header the way the proxy would.

### Calendar and Instagram on a partner's host

People at a partner's businesses connect Google Calendar and Instagram on the partner's host, and the connection finishes there. Both go through the host's Google and Meta apps, which accept only the redirect URIs the host registered: `GOOGLE_REDIRECT_URI` and `INSTAGRAM_REDIRECT_URI`, on the host's domain. The person's session cookie belongs to the partner's host, so the host's domain hands each callback on to it:

1. The start route (`/api/calendar/google/start`, `/api/calendar/google/connect` or `/api/integrations/instagram/start`) signs the partner's origin into the OAuth state, beside the person and the business. A state started on the host's domain names no origin.
2. Google or Meta sends the person to the callback on the host's domain. The callback checks the state's signature and that its origin still resolves to a partner, then redirects to the same path on that origin, with the code and state unchanged. It reads no session and uses up nothing.
3. On the partner's host, the callback checks that the session's person started the connection, uses up the state, exchanges the code, and lands on that host's integrations page. Calendar's callback also opens the business, under the partner's brand.

A partner's host refuses a state signed on any other host, and the host's domain refuses one whose origin no partner answers any more, such as a domain its partner removed. Either answers 400, so an authorization code never goes to a domain the deployment stopped serving. When the database can't say, the host's domain answers 500 and hands nothing on, and the person can reload the page. The Calendar connect link that `POST /v1/calendars/google/connect` returns already opens on the partner's domain, so its connection finishes there too.

### A partner's origin and emails

A partner's origin is its subdomain, with the scheme and port of `APP_BASE_URL`: `https://acme.receptionistportal.com` on the cloud, and `http://acme.partners.localhost:13000` in development. The worker moves every dashboard link in a partner's email to that origin, invitations to the partner's team included.

The origin stays on the subdomain after the partner connects its own domain. Sign-up needs a Turnstile token solved on the same hostname, and the widget's hostname list covers every subdomain through `PARTNER_BASE_DOMAIN`, while each partner's own domain needs a manual entry. A partner with no current subdomain, as on a deployment without `PARTNER_BASE_DOMAIN`, uses its own domain once the worker verified it, while the deployment still serves partners' own domains. A partner with neither has the host's origin.

A partner's emails go out from `no-reply@` the partner base domain, under the partner's name and logo, with its support email as the Reply-To. Without a support email they have no Reply-To, and without `PARTNER_BASE_DOMAIN` they go out from the address in `EMAIL_FROM`.

### Partner subdomains

Signup reserves `<slug>.<PARTNER_BASE_DOMAIN>` for each partner. A partner that signed up while `PARTNER_BASE_DOMAIN` was unset or unusable gets its subdomain when the admin next starts, or when someone opens its Branding & domain page. A partner whose subdomain sits under an earlier base domain moves to the current one the same way, since each partner keeps one subdomain. The admin skips a subdomain that's one of the host's own hostnames or another partner's domain, and the page then shows no address.

### A partner's own domain

A partner can show its dashboard on a subdomain of its own website, such as `app.acmeagency.com`, beside its subdomain of `PARTNER_BASE_DOMAIN`. Owners and admins connect it on the **Branding & domain** page, and members see it there. A partner has one domain of its own at a time. A deployment turns this on with one of these:

- **Cloudflare for SaaS**: `CLOUDFLARE_SAAS_API_TOKEN` and `CLOUDFLARE_SAAS_ZONE_ID`, as on the cloud
- **Caddy's on-demand TLS**: `CADDY_ON_DEMAND_TLS=true`, with Compose's Caddy serving `docker/caddy/Caddyfile.tls` through `docker-compose.tls.yml`

Without either, the page leaves the domain out. While the deployment bills tiers, connecting a domain needs a paid tier: a Free partner's owners see a link to the **Billing** page instead. A deployment that bills no tiers lets any partner connect one.

The domain must be a subdomain outside the host's own hostnames and outside `PARTNER_BASE_DOMAIN`, and no partner may have it verified. It goes through these steps:

1. `addPartnerCustomDomain` saves it as pending in `public.partner_domains`, with a random verification token, and queues `partnerDomain.provision`.
2. The worker registers it with the provider: a Cloudflare custom hostname with a certificate validated over HTTP, or nothing for Caddy. It then asks the provider about it once, and saves the DNS records the partner adds: a CNAME to `PARTNER_DOMAIN_CNAME_TARGET`, a TXT record at `_domain-verification.<hostname>` that holds the token, and any TXT record Cloudflare asks for.
3. The `partnerDomain.check` job asks the provider and DNS again every minute in the domain's first hour, every 5 minutes in its first day, and hourly after that. Cloudflare's domain is ready when the hostname and its certificate are both active. Caddy's is ready when every address the domain reaches is one of the target's.
4. Once the provider reports it ready and the TXT record holds the token, the worker marks the domain verified and publishes a brand change. Every process then answers the domain with the partner's brand, Better Auth builds links on it, and `/api/tls/ask` approves it.

The TXT record proves the partner controls the domain. Anyone can point a CNAME at the deployment, and a domain someone else once connected may still point here, so the provider's answer alone never verifies a domain. Two partners can claim the same domain while neither has it verified, so a claim never keeps a domain from its owner. The first partner whose TXT record checks out gets the domain, and the worker marks every other claim on it failed. The page then tells that partner another dashboard connected the domain first.

When the provider turns a domain down, as Cloudflare does for a name it won't serve, the page shows Cloudflare's reasons, and the `partnerDomain.check` job tries again on the same schedule. The job also registers any domain whose `partnerDomain.provision` job ran out of retries, so a provider outage never strands one. A domain the provider or DNS can't answer for waits its turn, and the job fails only when nothing answered.

The page asks for the domain's state every 15 seconds while it waits, and shows each record with whether it checks out, and the provider's own error messages. When Cloudflare gives up on a domain, the page marks it failed, and the partner removes it and connects it again. Removing a domain announces a brand change, so every process stops answering it, and queues `partnerDomain.remove`, which removes the Cloudflare hostname unless a partner's domain still holds it. Registering, verifying and removing a hostname each hold a lock on it, so a removal never deletes a Cloudflare hostname that a new claim just reused.

Only the worker marks a partner's own domain verified. The app role adds one only as pending, never changes one, and removes one as the system actor once the domain module checked the person's role. The worker reads and updates partners' own domains and no subdomain, through column grants that never move a domain to another partner or hostname or change its token.

`/api/tls/ask?domain=<hostname>` answers Caddy before it issues a certificate. It approves the host's own domain without the database, and any hostname a brand answers for: a partner's subdomain, and a partner's verified own domain. Everything else gets a 404, and the route answers 503 when the database can't say, so Caddy asks again later. It answers during maintenance too, so renewals keep working.

### How a change reaches every process

Each admin and worker process caches brands for 30 seconds, including hostnames no brand answers for. Saving a partner's brand, reserving a partner's subdomain, and saving the host's brand in onboarding each publish a message on the Redis channel `<REDIS_PREFIX>:brand-changes`. Every process listens on that channel and drops what the change touched right away. After its Redis connection comes back, a process drops everything it cached, since it may have missed a message. Without Redis, or when a message can't be sent, other processes show the change once their cache runs out.

## How it works

- `packages/shared/src/branding.ts`: the variable names, the limits, the order of precedence (`resolveBranding`), and the logo type check (`brandLogoContentType`).
- `packages/shared/src/brand.ts`: the `Brand` type, the host brand built from the name, logo, outside links, `APP_BASE_URL`, `EMAIL_FROM`, and `EMAIL_REPLY_TO`, and the brand reference queued emails carry.
- `packages/db/migrations/0113_deployment_branding.sql`: the one-row table and the two functions. Every runtime role can read the table, but only `app.save_initial_branding()` writes to it. Row level security is forced on it.
- `packages/domain/src/server/branding.ts`: reads and saves the branding, and resolves the name text messages use.
- `packages/shared/src/hosts.ts`: which hostnames are the host's own domain. `partnerBrand()` in `brand.ts` builds a partner's brand from its saved fields.
- `packages/domain/src/server/brands.ts`: answers which brand a hostname (`resolveHostBrand`), a business (`brandForBusiness`), or a queued email (`brandForEmail`) shows, as [Partner brands](#partner-brands) describes, with a 30-second cache per process and the Redis channel that clears it. Text messages never ask it, so they keep the host's name.
- `packages/domain/src/server/partners.ts`: the Branding & domain page's read and save (`getPartnerBrandSettings`, `savePartnerBrand`), which check the partner member's role, and the subdomain reservation.
- `packages/domain/src/server/partnerDomains.ts`: a partner's own domain, from the page's add and remove to the worker's provisioning and checks, as [A partner's own domain](#a-partners-own-domain) describes. `packages/providers/src/customHostnames/` holds the `CustomHostnameProvider` interface, its Cloudflare for SaaS and Caddy adapters, the TXT lookup, and the fakes its tests use. Migration 0152 adds the domain's provider, records, errors and verification token to `public.partner_domains`, and keeps a hostname unique among verified domains only.
- `apps/admin/proxy.ts` and `apps/admin/src/lib/host-resolution.ts`: resolve each request's `Host` header, answer a hostname no brand answers for with a 404, and pass the brand on in the headers `apps/admin/src/lib/request-brand.ts` defines. The standalone server's request URL holds the address it listens on, so only the `Host` header says where the visitor was.
- `apps/admin/src/lib/auth.ts`: Better Auth's base URL and trusted origins for each request, and Google sign-in on the host's domain only, as [Signing in on a partner's host](#signing-in-on-a-partners-host) describes.
- `apps/admin/src/lib/oauth-callback-host.ts`: where a Google Calendar or Instagram callback goes, as [Calendar and Instagram on a partner's host](#calendar-and-instagram-on-a-partners-host) describes.
- `apps/admin/src/lib/branding.ts`: loads the brand the proxy resolved for each request. If the database can't be read, pages on the host's own domain fall back to the environment and the default, and the admin reports the error at most once a minute.
- `apps/admin/src/lib/partner-site.ts` and `apps/admin/app/(partner-site)`: each partner's copy of the prerendered public pages, as [Prerendered pages](#prerendered-pages) describes.
- `apps/admin/src/lib/brand-changes.ts`: publishes brand changes to Redis, and listens for them in each copy of the brand cache.
- Routes:
  - `GET /api/branding` returns `{ appName, logoUrl }` for the request's brand and is never cached.
  - `GET /api/branding/logo` serves the saved logo of the request's brand, or with `?partner=` a partner's logo or favicon. Its URL carries the image's SHA-256 (`?v=`), so browsers can keep it for good.
  - `POST /api/branding/initial` saves the onboarding choice.
  - `GET` and `PUT /api/partner/branding` read and save a partner's brand for the console. A save also marks each of the partner's public pages to render again on its next visit.
  - `GET`, `POST` and `DELETE /api/partner/domain` read a partner's addresses, and connect and remove its own domain.
  - `GET /api/tls/ask` answers Caddy's on-demand TLS.
- `BrandingProvider` (`apps/admin/src/components/branding-provider.tsx`) gives the name and logo to every component, and on a partner's pages the partner's favicon, color, and links. It sets the `{{appName}}` i18n variable, and it keeps the tab's title and icon in step when they differ from what the server rendered.

### How an email gets its brand

Each `email.send` payload names its brand in `brand` and its Reply-To in `replyTo`. The `brand` value is one of these:

- `{ "kind": "business", "businessId": "…" }` for an email about a business, such as an invitation to its team.
- `{ "kind": "partner", "partnerId": "…" }` for a partner's own emails, such as an invitation to its team.
- The brand of the request that sends the email, such as a sign-up code: `{ "kind": "partner", "partnerId": "…" }` on a partner's domain, and `{ "kind": "host" }` on the host's.
- `{ "kind": "host" }` for the host's own emails: dashboard feedback and the founder check-in.

A partner's brand carries the partner's name, logo, and origin, and sends as [A partner's origin and emails](#a-partners-origin-and-emails) describes. The worker reads the partner through `app.partner_brand`, and keeps the email queued when it can't find the partner.

The worker reads the brand when it sends, so a brand change reaches emails still in the queue. It sends a payload with no `brand` under the host brand. A payload whose `brand` it can't read stays in the queue. When the worker can't read the saved branding, it sends a host email under the environment's choice and holds an email under any other brand until the database answers.

`packages/providers/src/email/smtp.ts` writes three things under the email's brand:

- **Subject**: the template writes it when the payload names none. Sign-up, verification, password reset, email change, invitation, and platform-key sign-up emails name none.
- **Name and logo**: the host's emails keep LobbyStack and its mark whatever the deployment's branding, as [Still branded](#still-branded) lists.
- **Dashboard links**: producers queue whole links, and the worker keeps each link's path and query on the brand's origin.

`emailSender` in `packages/shared/src/brand.ts` picks the sender and Reply-To. The host sends from `EMAIL_FROM` exactly as written, with `EMAIL_REPLY_TO` as the Reply-To. A `replyTo` of `null` means the brand's own. The founder check-in and the number trial and release emails have a sender of their own, so replies go to that sender.

Two kinds of email carry no `brand`:

- **Number trial and release emails**: they hold the host's prices and come from the founder. A partner's businesses never get them, so the worker sends them under the host brand.
- **Operator alerts**: they come from delivery rows, which hold the business. The worker sends each one under its business's brand.

### Prerendered pages

The sign-in, sign-up, and other public pages are prerendered at build time, before any database can be read. They carry the branding that the build's environment sets. When either variable is missing at build time, the browser asks `/api/branding` for both, except on the cloud (`DEPLOYMENT_MODE=cloud` at build time), which never reads a saved choice. Until it answers, the page keeps the logo's space empty instead of showing a name it would then replace, and then the tab title and icon follow. Setting both variables for the build skips that request.

A build can't know a partner's brand, so on a partner's host the proxy rewrites these pages to the partner's own copy under the internal `/partner-site/<partner id>/` tree. The first visit renders a partner's copy with its brand from the start, and Next.js then keeps it as a static page for 60 seconds before it renders it again. Every hostname answers the `/partner-site` prefix with a 404 when a visitor asks for it directly.

When a partner saves its brand, the admin process that saved it renders that partner's copies again on their next visit: the route passes each copy's path, such as `/partner-site/<partner id>/fr/login`, to `revalidatePath`, since Next.js tags a cached page with its own path. Other replicas keep their copies until those 60 seconds pass. The proxy lets shared caches keep a partner's page for the same window (`public, s-maxage=60, stale-while-revalidate=60`), so a saved brand shows on the partner's public pages within about two minutes.

## Text that keeps LobbyStack on purpose

- The consent text for operator alert texts (`OPERATOR_SMS_DISCLOSURE_TEXT` in `packages/shared/src/operatorSmsConsent.ts`, and `settings:notifications.phoneVerification.*.consent`). It's versioned, and each opt-in records it word for word, so a new name needs a new disclosure version. A test in `apps/admin/src/lib/locale-parity.test.ts` fails if any other dashboard string names LobbyStack.
- Identifiers that stored data or the public API depend on. They don't appear in the interface, and renaming them would break existing deployments:
  - Pepper labels in `packages/domain/src/server/oauth/tokens.ts` and `publicApi/apiKeys.ts`.
  - UUID namespaces in `publicApi/operations.ts` and `publicApi/users.ts`.
  - The `lobbystack-scrypt-v1` password hash format.
  - The `__lobbystack_migrations` journal and its advisory lock.
  - The `LobbyStack-Business` API header (keep it, or add an alias).
  - Cookie and storage keys, `x-lobbystack-*` headers, the Redis prefix, and telemetry names.

## Still branded

These places still say LobbyStack or link to lobbystack.com. Variables marked "proposed" don't exist yet. When someone adds them, resolve them like the name and logo: the environment first, then a saved value, then the default.

| Area | Where | Proposed setting |
| --- | --- | --- |
| Email subjects and bodies | `packages/providers/src/email/smtp.ts`: `shownBrand` keeps LobbyStack's name and the inline 48×48 mark for the host brand, and the founder sign-offs, feedback, and trial and release emails say LobbyStack; `packages/domain/src/server/onboarding.ts` and `feedback.ts` write the founder check-in and feedback subjects; the default subject "LobbyStack notification", which invitations use | Let `shownBrand` pass the host brand through, as it does a partner's, and give the worker `BRAND_APP_NAME` and `BRAND_LOGO_URL`. The worker already reads the saved choice, and the email header then uses the logo at `APP_BASE_URL` + `/api/branding/logo`. |
| Email sender | `EMAIL_FROM` (an existing variable; defaults to `LobbyStack <no-reply@…>`) | Already configurable. Default the display name to the app name. |
| Operator alert emails | `packages/domain/src/server/calendar.ts`, `publicApi/webhooks.ts` | The app name. |
| SMS | The "LobbyStack:" opening of the START replies in `packages/domain/src/server/sms.ts`; the verification code text in `verificationCode.ts`, which is also sent to callers who change an appointment, in English only | The app name, as the HELP replies already use. The replies are part of the registered A2P 10DLC campaign, so update the campaign when they change. |
| Referral links | `apps/admin/app/api/affiliate/route.ts` falls back to `https://app.lobbystack.com` | `SITE_URL` already overrides it. |
| AI and voice text | The placeholder summary "… uses LobbyStack to answer calls." (`tenancy.ts`, `businessSummary.ts`), which `agent-core/src/businessFacts.ts` and migration 0074 detect by its wording; the MCP server's title and instructions (`apps/admin/src/lib/mcp/server.ts`) | The app name. The placeholder detection has to keep matching the old wording. |
| API and OAuth | The OpenAPI title "LobbyStack API" and descriptions such as "LobbyStack Cloud" (`packages/shared/src/publicApi/`); API error messages; the webhook test event; the `LobbyStack-Webhooks` and `LobbyStack-OAuth` user agents; the OAuth resource name and realm (`apps/admin/src/lib/mcp/oauth-config.ts`, `oauth-provider.ts`) | The app name, except the user agents. |
| Website widget | The `window.LobbyStack` global, the `lobby-widget-*` classes, and the default color `#0f766e` (`packages/embed`, built into `apps/admin/public/embed/embed.js`) | Keep `window.LobbyStack` as an alias, because customers' sites may call it. `BRAND_ACCENT_COLOR` (proposed) for the default color. |
| Twilio | Numbers get the friendly name `LobbyStack <business id>` (`apps/worker/src/handlers.ts`) | The app name. Only the Twilio console shows it. |
| CLI and Zapier | The `lobbystack` command, its config path, and its help text, which links to `docs.lobbystack.com` (`packages/cli`); the Zapier app's labels, errors, and docs link, plus its name and logo in Zapier's dashboard (`integrations/zapier`) | Separate distributions, so they're renamed by publishing a renamed copy rather than with a variable. |
| Marketing site and docs | The admin's marketing pages in `apps/admin/src/marketing` and `apps/admin/content` (about 6,700 mentions) and `mintlify` (about 1,200), including logos, favicons, Open Graph images, structured data, and the legal entity "Lobbystack Inc." | Separate sites, so they're rebranded as content rather than with a variable. |
| Observability | `lobbystack-admin` and `lobbystack-worker` service names, and `lobbystack.*` metric names | Operators see these, end users don't. `OTEL_SERVICE_NAME` already overrides the service name. |

### Writing translations that use the name

A configurable name can't change its form, so translated strings have to use it as it is:

- In Serbian, put the name in apposition ("sa servisom {{appName}}") or use it as a modifier ("{{appName}} nalog"). Never inflect it, as in "LobbyStack-om".
- In French, avoid "de" and "le" directly before the name, because a name that starts with a vowel needs "d'" and "l'".
- In Spanish, avoid an article before the name.
