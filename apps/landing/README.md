# LobbyStack landing site

Astro marketing site for `lobbystack.com`, with React islands, shadcn/ui components, SEO routes, RSS, Pagefind search, localized French pages, and Cloudflare Pages middleware.

## Run the landing site

Run commands from the repository root:

```bash
pnpm dev:landing
pnpm landing:typecheck
pnpm landing:build
pnpm landing:preview
```

## PostHog analytics

The site initializes PostHog from `src/lib/posthog.ts` when `PUBLIC_POSTHOG_ENABLED=true` and `PUBLIC_POSTHOG_KEY` is present.

Production sends analytics through the first-party hostname `ts.lobbystack.com`:

```ini
PUBLIC_POSTHOG_ENABLED=true
PUBLIC_POSTHOG_KEY=your_posthog_project_token_here
PUBLIC_POSTHOG_HOST=https://ts.lobbystack.com
PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
```

`ts.lobbystack.com` is a DNS-only CNAME record for PostHog's managed reverse proxy, which forwards requests to PostHog's US ingestion and asset hosts. Keep preview deployments off unless you are validating analytics. [Deploy the landing site on Cloudflare Pages](../../docs/deployment/landing-cloudflare-pages.md) covers the Pages project and its settings.

## Add a component

To add components to your app, run the following command:

```bash
pnpm --filter @lobbystack/landing exec shadcn add button
```

The command adds the UI component to `src/components`.

## Use a component

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
