# Contribute to LobbyStack

LobbyStack accepts focused fixes and features that preserve tenant isolation, provider boundaries, and the live call path. This guide explains the repository expectations and required checks.

## Follow the architecture boundaries

- Keep PostgreSQL as the durable source of truth
- Put persistence, migrations, roles, and row-level security in `packages/db`
- Put reusable business operations in `packages/domain`
- Keep the voice gateway focused on Twilio Voice, Media Streams, and OpenAI Realtime
- Call the admin backend for authoritative voice operations
- Use shared provider adapters instead of importing provider SDKs into domain code

## Prepare a change

1. Open an issue or draft a proposal for an architecture change.
2. Add tests for affected critical paths.
3. Update documentation and architecture decision records when behavior changes.
4. Keep the change focused enough for a reviewer to verify.

## Run the project

Use `pnpm` from the repository root. Start PostgreSQL and Redis before running the application:

```bash
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

Mock providers support routine development without live Twilio, AI, calendar, or email credentials.

## Verify your change

Run these checks before opening a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run `pnpm db:check` and `pnpm db:verify-rls` after changing migrations, roles, or row-level security.

## Follow the code style

- Use TypeScript with strict types at system boundaries
- Add TSDoc or JSDoc to important exports and non-obvious invariants
- Keep tests beside their source as `*.test.ts` or `*.test.tsx`
- Use translation keys for dashboard copy
- Format dates, times, and numbers with the active locale
