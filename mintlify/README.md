# LobbyStack Mintlify Docs

This directory contains the source for [docs.lobbystack.com](https://docs.lobbystack.com/).

Mintlify is configured in the dashboard to read this repository with **Docs are in a subdirectory** enabled and the docs path set to:

```txt
mintlify
```

The site uses `docs.json` for navigation, branding, colors, and global settings. Public pages are written as MDX files next to that config.

## Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview documentation changes locally:

```bash
npm i -g mint
```

Run the preview from this directory, where `docs.json` is located:

```bash
cd mintlify
mint dev
```

View your local preview at `http://localhost:3000`.

## Publishing changes

Mintlify deploys from the connected GitHub repository. Push changes to the configured branch to publish updates.
