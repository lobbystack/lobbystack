# Cloudflare Workers Web Deploy

This repo deploys the dashboard in `apps/web` to Cloudflare Workers Static Assets.

## What Is Configured

- Wrangler config: `apps/web/wrangler.jsonc`
- Deploy command: `pnpm --filter @ai-receptionist/web build` then `wrangler deploy`
- GitHub integration: pushes to `main` deploy automatically through `.github/workflows/ci.yml` after the validation job passes

## Required GitHub Secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token needs permission to deploy Workers for the target account.

## Required GitHub Variables

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`

Optional:

- `VITE_APP_NAME`

## First Production Deploy

1. Add the GitHub secrets and variables above.
2. Push the workflow to `main`.
3. The `deploy_web_worker` job in CI will build `apps/web` and deploy the Worker named `ai-receptionist-web`.
4. In Cloudflare, attach your production custom domain to that Worker if you do not want to use the default `workers.dev` hostname.

## Cloudflare Location Headers

For onboarding number inference, enable Cloudflare's `Add visitor location headers` Managed Transform so headers like `cf-ipcity`, `cf-region-code`, `cf-postal-code`, `cf-iplatitude`, and `cf-iplongitude` reach the Convex origin.

Without those headers, the onboarding flow will fall back to lower-confidence timezone/default inference.
