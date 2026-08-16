# Repository Guidelines

## Project Structure

- `apps/admin/`: Next.js operator dashboard, authentication, and HTTP API.
- `apps/worker/`: asynchronous jobs and transactional outbox dispatch.
- `apps/voice-gateway/`: narrow Fastify runtime for Twilio Voice, Media Streams, and OpenAI Realtime.
- `apps/landing/`: public marketing site.
- `packages/db/`: Drizzle schema, PostgreSQL migrations, role-specific clients, and RLS helpers.
- `packages/domain/`: durable business logic shared by admin and worker runtimes.
- `packages/`: shared contracts, jobs, providers, telemetry, configuration, and test helpers.
- `docker/`, `docker-compose.yml`, and `scripts/`: local infrastructure, operations, migration, and certification tooling.

## Development Commands

- `pnpm install`: install workspace dependencies.
- `docker compose up -d postgres redis minio minio-init`: start local infrastructure.
- `pnpm db:migrate`: apply PostgreSQL migrations.
- `pnpm dev`: run admin, worker, voice gateway, and landing apps.
- `pnpm typecheck`: typecheck all active workspaces and scripts.
- `pnpm test`: run all Vitest suites.
- `pnpm build`: build every workspace package and app.

## Coding Style

- TypeScript ESM throughout; use 2-space indentation and LF line endings.
- Use `PascalCase` for React components and `camelCase` for functions and utilities.
- Keep durable business logic in `packages/domain` and persistence in `packages/db`.
- Keep the voice gateway focused on the live call path; it calls the admin backend for authoritative operations.
- Keep voice personalization snapshot-based. Fetch a business snapshot at call start and avoid per-turn backend reads for common replies.

## Design System

- Treat `shadcn/ui` as the default operator UI system in `apps/admin`.
- Use Geist Sans and Lucide icons; do not mix icon families.
- Use the existing 4px spacing grid and established semantic color/radius tokens.
- Prefer `rounded-xl` for standard surfaces and controls, and `rounded-full` for pills, badges, avatars, and circular controls.
- Preserve colors, copy, logic, responsiveness, and route architecture during consistency cleanup.

## Localization

- Use translation keys for dashboard copy.
- Keep locale files in `apps/admin/public/locales/{lng}/{ns}.json`.
- Avoid concatenating translated sentences; use interpolation.
- Format dates, times, and numbers with the active locale through `Intl` or Luxon.

## Testing

- Vitest is the default test runner; keep `*.test.ts` and `*.test.tsx` near their source.
- Test database behavior against PostgreSQL with the correct runtime role and RLS context.
- Prioritize booking, authz, webhook, outbox, snapshot, privacy, and telemetry regressions.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before opening a PR.
- When changing migrations or RLS, also run `pnpm db:check` and `pnpm db:verify-rls` against the test database.

## Migration Guardrails

- PostgreSQL is the canonical runtime datastore.
- Retain `replacement:import`, `replacement:import-check`, and `replacement:reconciliation` until production cutover and rollback windows close.
- Retain `legacy_convex_id` lineage columns until migration reconciliation and rollback are complete.
- Convex references are allowed only in migration, cutover, rollback, and historical ADR documentation.
