# LobbyStack Mintlify Docs

This directory contains the source for [docs.lobbystack.com](https://docs.lobbystack.com/).

Mintlify is configured in the dashboard to read this repository with **Docs are in a subdirectory** enabled and the docs path set to:

```txt
mintlify
```

The site uses `docs.json` for navigation, branding, colors, and global settings. Public pages are written as MDX files next to that config.

## Development

Preview documentation changes locally with the Mintlify CLI:

```bash
pnpm docs:dev
```

The preview starts at `http://localhost:3000` and reloads as you edit. You can also run it from this directory:

```bash
cd mintlify
pnpm dev
```

Useful commands:

```bash
pnpm docs:dev:no-open
pnpm docs:validate
pnpm docs:broken-links
```

View your local preview at `http://localhost:3000`.

## Publishing changes

Mintlify deploys from the connected GitHub repository. Push changes to the configured branch to publish updates.
