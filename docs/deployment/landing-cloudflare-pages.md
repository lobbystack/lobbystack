# Deploy the landing site on Cloudflare Pages

The landing site in `apps/landing` deploys through the Cloudflare Pages project `lobbystack-site`, which builds from GitLab. A push to `main` on GitLab that touches the landing site publishes it to `lobbystack.com`.

## Pages projects

Two Pages projects have served the landing site:

| Project | Source | Status |
| --- | --- | --- |
| `lobbystack-site` | GitLab `lobbystack-group/lobbystack` | Live since 2026-10-21. Serves `lobbystack.com` and `www.lobbystack.com`. |
| `lobbystack-landing` | GitHub `lobbystack/lobbystack` | Builds turned off, kept as a rollback. Cloudflare can no longer clone the GitHub repository. |

## Build settings

`lobbystack-site` builds with these settings:

- Production branch: `main`
- Root directory: `apps/landing`
- Build command: `pnpm build`
- Build output directory: `dist`
- Node version: `22.12.0`, from the `NODE_VERSION` variable
- pnpm version: `10.30.3`, from the `PNPM_VERSION` variable
- Automatic production deployments: on
- Preview deployments: off
- Build watch paths: `apps/landing/*`, `packages/*`, `package.json` and `pnpm-lock.yaml`

`apps/landing/.nvmrc` asks for Node 26, while the project sets `NODE_VERSION=22.12.0`. Keep the two in step when you change either.

## Configure environment variables

Production uses these Cloudflare Pages environment variables:

- `PUBLIC_POSTHOG_ENABLED=true`
- `PUBLIC_POSTHOG_KEY`
- `PUBLIC_POSTHOG_HOST=https://ts.lobbystack.com`
- `PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com`
- `PUBLIC_WEB_CALL_BUSINESS_SLUG=lobbystack-mp35s9y1`
- `INDEXNOW_KEY`
- `NODE_VERSION` and `PNPM_VERSION`, listed under build settings

Add these only when you need them:

- `PUBLIC_LIVE_CALL_ENDPOINT`, to point the demo call somewhere other than `https://app.lobbystack.com/api/voice/live/session`
- `GOOGLE_SITE_VERIFICATION`, for Google Search Console
- `BING_SITE_VERIFICATION`, for Bing Webmaster Tools

The admin accepts the landing page's demo call only for the business named by its own `WEB_CALL_PUBLIC_BUSINESS_SLUG`, from an origin in `WEB_CALL_ALLOWED_ORIGINS`. Keep `PUBLIC_WEB_CALL_BUSINESS_SLUG` equal to the admin's value, or the admin refuses demo calls with HTTP 403.

## Domains

- `lobbystack.com` and `www.lobbystack.com` are proxied CNAME records for `lobbystack-site.pages.dev`. `functions/_middleware.js` redirects `www.lobbystack.com` and `lobbystack-site.pages.dev` to `lobbystack.com`.
- `ts.lobbystack.com` is a DNS-only CNAME record for PostHog's managed reverse proxy, so PostHog serves the analytics hostname. It isn't attached to a Pages project.

## Roll back to the old project

`lobbystack-landing` still holds its last successful build. To serve it again, attach `lobbystack.com` and `www.lobbystack.com` to `lobbystack-landing` in Cloudflare Pages, then point both CNAME records at `lobbystack-landing.pages.dev`. It can't build anything new: its last successful build is commit `7ba40243` from 2026-10-16.

## Verify the site locally

From the monorepo root:

```bash
pnpm landing:typecheck
pnpm landing:build
pnpm landing:preview
```

The build output is `apps/landing/dist`, the directory Cloudflare Pages publishes.
