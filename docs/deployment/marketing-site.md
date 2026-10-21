# Serve lobbystack.com from the admin app

The admin app serves the marketing site on every hostname listed in `MARKETING_HOSTS`, and the dashboard on every other hostname. This guide explains how requests reach the marketing pages, how to run and check them, and how to move `lobbystack.com` from Cloudflare Pages to the admin and back. Until that move, Cloudflare Pages keeps serving `lobbystack.com` from `apps/landing`, as [Deploy the landing site on Cloudflare Pages](landing-cloudflare-pages.md) describes.

## How a request reaches a marketing page

The proxy in `apps/admin/proxy.ts` hands requests for a marketing host to `apps/admin/src/marketing/proxy.ts`, which does the following:

- Redirects every other host in `MARKETING_HOSTS` to the first one, so `www.lobbystack.com` goes to `lobbystack.com`.
- Adds the trailing slash to page URLs with a 301, as the Astro site did.
- Sends a visitor whose language cookie or browser prefers French, Spanish or Serbian from an English page to the same page in that language with a 302. Crawlers always get the page they asked for.
- Rewrites the URL to the internal route under `app/(marketing)/site/[locale]`. `/fr/pricing/` renders `/site/fr/pricing`, and English pages render under `/site/en`.
- Sends the headers and redirects that `apps/landing/public/_headers` and `_redirects` defined, from `src/marketing/response-headers.ts`.

The dashboard host answers `/site/*` with a 404, so the marketing pages exist only on the marketing hosts.

Every marketing page is built ahead of time. After `next build`, `pnpm --filter @lobbystack/admin build` also runs these steps:

1. `scripts/marketing/snapshot.mjs` copies the built pages into `apps/admin/.marketing-dist` under their public URLs.
2. `scripts/marketing/sitemap.mjs` writes the sitemaps to `public/marketing-sitemaps`, which the proxy serves as `/sitemap-index.xml`, `/sitemap-site-0.xml` and `/sitemap-blog-0.xml`.
3. Pagefind indexes the snapshot into `public/pagefind` for the `/search/` page.
4. `scripts/marketing/indexnow.mjs` sends IndexNow the pages whose content differs from the live site. It does nothing unless `INDEXNOW_KEY` is set.

The root `pnpm build` then runs `scripts/verify-admin-prerender.ts`, which fails if a marketing page would render per request. The 404 page and the IndexNow key file are the only exceptions.

## Run the marketing site locally

`.env.example` sets `MARKETING_HOSTS=lobbystack.localhost,www.lobbystack.localhost`; copy that line to your `.env`. Start the admin and open `http://lobbystack.localhost:13000` for the marketing site, or `http://localhost:13000` for the dashboard:

```bash
pnpm dev:admin
```

Browsers resolve every `*.localhost` name to your machine, so no hosts file entry is needed. The sitemaps and the search index exist only after a production build. To try those, build the admin and prepare its standalone server from the repository root:

```bash
pnpm --filter @lobbystack/admin build
```

```bash
node scripts/prepare-admin-standalone.ts
```

Then start it from its directory:

```bash
cd apps/admin/.next/standalone/apps/admin
HOSTNAME=0.0.0.0 PORT=13099 MARKETING_HOSTS=lobbystack.localhost \
  node --env-file=../../../../../../.env server.js
```

Then open `http://lobbystack.localhost:13099`. Bind to `0.0.0.0` as production does. With `127.0.0.1`, Next.js treats the proxy's rewrites as requests to another server.

## Set the build arguments and variables

The marketing pages are built ahead of time, so the admin image needs their settings at build time. Only `MARKETING_HOSTS` and the runtime half of `INDEXNOW_KEY` are read while the server runs. Set them all in the admin's environment in Dokploy: [Release a commit to Dokploy](dokploy-release.md) builds the admin image with build arguments taken from there, and its list of build arguments must name the ones below.

| Name | When | Production value | Purpose |
| --- | --- | --- | --- |
| `MARKETING_HOSTS` | Runtime | `lobbystack.com,www.lobbystack.com` | Hosts that get the marketing site. The first is canonical. Leave it unset to serve only the dashboard. |
| `NEXT_PUBLIC_LANDING_SITE_URL` | Build | `https://lobbystack.com` | The site's origin. Any other origin makes `robots.txt` disallow crawling. |
| `NEXT_PUBLIC_APP_URL` | Build | `https://app.lobbystack.com` | Origin of the sign-up and log-in links. Unset falls back to the production dashboard. |
| `NEXT_PUBLIC_WEB_CALL_BUSINESS_SLUG` | Build | `lobbystack-mp35s9y1` | Business the hero demo call reaches. Keep it equal to the admin's `WEB_CALL_PUBLIC_BUSINESS_SLUG`. |
| `NEXT_PUBLIC_LIVE_CALL_ENDPOINT` | Build | Unset | Demo call endpoint. Unset uses `https://app.lobbystack.com/api/voice/live/session`. |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | Build | The current tokens | Search console verification meta tags. |
| `INDEXNOW_KEY` | Build and runtime | The current key | At build, submits changed pages. At runtime, serves the key file at `/<key>.txt`. Set it for production only. |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | Build | The dashboard's values | Analytics after cookie consent, in the same project as the dashboard. |

The demo call leaves the marketing host for `app.lobbystack.com`, so the admin's `WEB_CALL_ALLOWED_ORIGINS` must keep listing `https://lobbystack.com` and `https://www.lobbystack.com`.

## Check a build against the live site

Validate the snapshot. The validator checks the sitemaps, titles, descriptions, canonical URLs, hreflang links, headings, JSON-LD and internal links of every indexable page:

```bash
pnpm --filter @lobbystack/admin marketing:validate
```

Then compare the build with the site it replaces. `--sitemap` checks every URL in the reference site's sitemap; pass paths instead to check a few:

```bash
node apps/admin/scripts/marketing/parity.mjs \
  http://lobbystack.localhost:13099 --sitemap
```

The script compares status, title, description, canonical URL, robots, Open Graph and hreflang tags, JSON-LD types, headings and the text of `<main>`. On the first run, 278 of 288 pages matched. The 10 trade solution pages differ by one space that the Astro build dropped in "a plumbing business".

## Move lobbystack.com to the admin

Try the move on staging first, with a hostname of its own. Cloudflare's universal certificate covers one level of subdomain, so use `staging-www.lobbystack.com`, not `www.staging.lobbystack.com`.

1. Add a proxied A record for `staging-www.lobbystack.com` pointing at `40.160.96.129`.
2. Build and release a staging admin image with `NEXT_PUBLIC_LANDING_SITE_URL=https://staging-www.lobbystack.com`, following [Release a commit to Dokploy](dokploy-release.md). That origin makes the staging `robots.txt` disallow crawling.
3. On the staging admin app in Dokploy, add the domain `staging-www.lobbystack.com` on port 3000 with a Let's Encrypt certificate, and set `MARKETING_HOSTS=staging-www.lobbystack.com`.
4. Run the parity script with `https://staging-www.lobbystack.com` as the candidate.

Then move production:

1. Release a production admin image built with the production values from the table above.
2. On the production admin app in Dokploy, add the domains `lobbystack.com` and `www.lobbystack.com` on port 3000 with Let's Encrypt certificates, and set `MARKETING_HOSTS=lobbystack.com,www.lobbystack.com` and `INDEXNOW_KEY`.
3. In Cloudflare DNS, replace the proxied CNAME records for `lobbystack.com` and `www.lobbystack.com`, which point at `lobbystack-site.pages.dev`, with proxied A records for `40.160.96.129`.
4. Remove both domains from the `lobbystack-site` Pages project, so Pages stops claiming them. Then check that the A records from step 3 are still in place.
5. Run the parity script against `https://lobbystack.com`. For `--reference`, use the address of the project's latest deployment, `deployment_id.lobbystack-site.pages.dev`; the project redirects its main `lobbystack-site.pages.dev` hostname to `lobbystack.com`.
6. Watch the admin's memory in Dokploy for a day. Production runs without a memory cap.

Let's Encrypt validates each new domain through Cloudflare over HTTP, so the certificates are issued only after step 3 sends the domains to the server. Cloudflare serves its own certificate to visitors in the meantime.

## Roll back to Cloudflare Pages

Point the `lobbystack.com` and `www.lobbystack.com` records back at `lobbystack-site.pages.dev` as proxied CNAME records, and add both domains to the `lobbystack-site` project again. The project keeps building from `apps/landing` until that app is removed, so it serves the latest content.
