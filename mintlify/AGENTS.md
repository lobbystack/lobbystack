# LobbyStack Mintlify docs instructions

## About this project

- This is the source for [docs.lobbystack.com](https://docs.lobbystack.com/).
- Pages are MDX files with YAML frontmatter.
- Configuration lives in `docs.json`.
- Run `mint dev` from this directory to preview locally.
- Run `mint broken-links` from this directory to check links.

## Terminology

- Use "LobbyStack" for the product name.
- Use "Help Center" for customer-facing docs.
- Use "AI receptionist" for the caller-facing automation.
- Use "dashboard" for the operator web app.

## Style preferences

- Use active voice and second person ("you")
- Keep sentences concise — one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references
- Write customer-facing help first; save implementation detail for self-hosting and developer pages.

## Content boundaries

- Document customer setup, receptionist configuration, dashboard workflows, billing, integrations, and self-hosting.
- Do not publish internal architecture notes, ADRs, planning docs, or Linear tracking content here unless they are rewritten as public developer documentation.
