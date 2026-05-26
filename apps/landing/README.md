# LobbyStack Landing Site

Astro marketing site for `lobbystack.com`, with React islands, shadcn/ui components, SEO routes, RSS, Pagefind search, localized French pages, and Cloudflare Pages middleware.

## Development

Run commands from the repository root:

```bash
pnpm dev:landing
pnpm landing:typecheck
pnpm landing:build
pnpm landing:preview
```

## PostHog analytics

The site initializes PostHog from `src/lib/posthog.ts` when
`PUBLIC_POSTHOG_ENABLED=true` and `PUBLIC_POSTHOG_KEY` is present.

Production should use the first-party Cloudflare Pages proxy:

```ini
PUBLIC_POSTHOG_ENABLED=true
PUBLIC_POSTHOG_KEY=phc_...
PUBLIC_POSTHOG_HOST=https://ts.lobbystack.com
PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
```

Attach `ts.lobbystack.com` to the same Cloudflare Pages project. Requests on
that hostname are handled by `functions/_middleware.js` and forwarded to the
correct PostHog US ingestion or asset host. Keep preview deployments disabled
unless actively validating analytics.

## Adding components

To add components to your app, run the following command:

```bash
pnpm --filter @lobbystack/landing exec shadcn add button
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components in your app, import them in an `.astro` file:

```astro
---
import { Button } from "@/components/ui/button"
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Astro App</title>
  </head>
  <body>
    <div class="grid h-screen place-items-center content-center">
      <Button>Button</Button>
    </div>
  </body>
</html>
```
