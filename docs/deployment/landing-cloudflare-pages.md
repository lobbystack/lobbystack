# Landing Cloudflare Pages

The landing site lives in `apps/landing` and deploys through Cloudflare Pages'
Git integration, matching the old standalone landing-site repo behavior without
requiring a Wrangler deploy flow.

## Cloudflare Pages Settings

Cloudflare currently has two landing-related Pages projects:

- `lobbystack-site`: the old live project connected to
  `lobbystack/LobbyStack-Site`.
- `lobbystack-landing`: the monorepo-connected replacement connected to
  `lobbystack/lobbystack`.

Configure `lobbystack-landing` with:

- Repository: `lobbystack/lobbystack`
- Production branch: `main`
- Root directory: `apps/landing`
- Build command: `pnpm build`
- Build output directory: `dist`
- Node version: `22.12.0`
- pnpm version: `10.30.3`
- Automatic production deployments: enabled
- Preview deployments: all branches
- Build watch paths:
  - `apps/landing/**`
  - `package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`

The `apps/landing/.nvmrc` file pins the Node version for build environments
that read it from the project root directory.

## Environment Variables

Production should keep these Cloudflare Pages environment variables:

- `PUBLIC_POSTHOG_ENABLED=true`
- `PUBLIC_POSTHOG_KEY`
- `PUBLIC_POSTHOG_HOST=https://ts.lobbystack.com`
- `PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com`
- `PUBLIC_WEB_CALL_ENDPOINT=https://voice.lobbystack.com/web-call/sessions`
- `PUBLIC_WEB_CALL_BUSINESS_SLUG=lobbystack-mp35s9y1`
- `INDEXNOW_KEY`
- `GOOGLE_SITE_VERIFICATION`, if Google Search Console verification is needed
- `BING_SITE_VERIFICATION`, if Bing verification is needed

Keep `lobbystack.com`, `www.lobbystack.com`, and `ts.lobbystack.com` attached
to the same Pages project after the cutover. The `ts.lobbystack.com` hostname
is used by `apps/landing/functions/_middleware.js` as the first-party PostHog
proxy.

Do not move the production domains to `lobbystack-landing` until the landing
site files are committed and pushed to GitHub. Cloudflare already verifies that
`lobbystack-landing` clones `lobbystack/lobbystack`; its first manual build from
`main` failed only because `apps/landing` was not present on `main` yet.

## Local Verification

From the monorepo root:

```bash
pnpm landing:typecheck
pnpm landing:build
pnpm landing:preview
```

The build output remains `apps/landing/dist`, which is the directory Cloudflare
Pages should publish.
