# Cloudflare Workers Web Deploy

This repo deploys the dashboard in `apps/web` to Cloudflare Workers Static Assets.

## What Is Configured

- Wrangler config: `apps/web/wrangler.jsonc`
- Deploy script: `pnpm deploy:cloudflare`
- Preview script: `pnpm preview:cloudflare`
- GitHub integration target: Cloudflare Workers Builds
- GitHub Actions role: `.github/workflows/ci.yml` validates the repo, but production deployment is handled by Cloudflare, not by GitHub Actions

## Cloudflare Workers Builds Setup

1. In Cloudflare, go to `Workers & Pages`.
2. Create a new Worker from `Import a repository`, or open the existing Worker named `lobbystack`.
3. Connect the GitHub repository.
4. Set the production branch to `main`.
5. Set the root directory to `apps/web`.
6. Set the build command to:

```bash
pnpm install --frozen-lockfile=false && pnpm build
```

7. Set the deploy command to:

```bash
pnpm deploy:cloudflare
```

8. If you enable non-production branch builds, set the non-production deploy command to:

```bash
pnpm preview:cloudflare
```

Important:
- The Worker name in Cloudflare must match `name` in `apps/web/wrangler.jsonc`.
- Cloudflare’s docs note that this name match is required for repository-connected builds to succeed.

## Required Cloudflare Build Variables

Add these in the Worker’s `Settings > Build` configuration:

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`

Optional:

- `VITE_APP_NAME`
- `VITE_DEPLOYMENT_MODE=production`

These are build-time variables for Vite, not runtime Worker secrets.

## First Production Deploy

1. Save the Workers Builds configuration above.
2. Push to `main`.
3. Cloudflare will build `apps/web` and deploy the Worker named `lobbystack`.
4. Attach your production custom domain in Cloudflare if you do not want to use the default `workers.dev` hostname.

## Cloudflare Location Headers

For onboarding number inference, enable Cloudflare's `Add visitor location headers` Managed Transform so headers like `cf-ipcity`, `cf-region-code`, `cf-postal-code`, `cf-iplatitude`, and `cf-iplongitude` reach the Convex origin.

Without those headers, the onboarding flow will fall back to lower-confidence timezone/default inference.
