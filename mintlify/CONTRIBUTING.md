# Contribute to the documentation

Use this guide to update the public LobbyStack Help Center and preview your work before opening a pull request.

## How to contribute

### Edit a page on GitHub

1. Open the page you want to edit.
2. Click **Edit this file**.
3. Make the change and submit a pull request.

### Preview changes locally

1. Fork and clone this repository.
2. Run `pnpm install` from the repository root.
3. Create a branch for your changes.
4. Edit the MDX files under `mintlify/`.
5. Run `pnpm docs:dev:no-open` from the repository root.
6. Preview the Help Center at `http://localhost:3000`.
7. Run `pnpm docs:validate` and `pnpm docs:broken-links`.
8. Commit your changes and submit a pull request.

For more local development commands, see the [Mintlify docs README](README.md).

## Writing guidelines

- Use active voice and address the reader as “you.”
- Keep sentences under 20 words when clarity permits.
- Use sentence case for page and section headings.
- Bold interface labels such as **Settings**.
- Format commands, paths, and identifiers as code.
- Explain each code block before it appears.
