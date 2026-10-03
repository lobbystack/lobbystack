# Repository guidelines

## Project structure

- `apps/admin/`: Next.js operator dashboard, authentication, and HTTP API. Hosts the embeddable widget API (`/api/widget/*`), the loader (`/embed.js`), and the widget iframe app (`/embed/[key]`) in addition to the dashboard.
- `apps/worker/`: asynchronous jobs, transactional outbox dispatch, and GPT-Live calls. The admin asks it to attach to each session at `/internal/live/attach`; it answers delegated requests, saves transcripts, and finishes the call. Phone calls reach GPT-Live through a Twilio Elastic SIP trunk; see `docs/voice/runtime.md`.
- `apps/landing/`: public marketing site.
- `packages/db/`: Drizzle schema, PostgreSQL migrations, role-specific clients, and RLS helpers.
- `packages/domain/`: durable business logic shared by admin and worker runtimes. Widget conversations use the `web_chat` channel and key on `widget_visitor_id` (no phone required).
- `packages/agent-core/`: the receptionist agent (AI SDK `ToolLoopAgent`) shared by website chat and calls, its tools, and the GPT-Live session config and call controller.
- `packages/ai/`: system-prompt builders.
- `packages/providers/`: provider adapters (Twilio, embeddings, calendars, email). Text AI goes through the agent core: set `AI_CHAT_*` (`API_KEY`, `BASE_URL`, `MODEL`, `PROVIDER_NAME`, `REASONING_EFFORT`). On OpenAI the default is `gpt-6-luna` on high reasoning through the Responses API, except that GPT-Live delegation runs on low reasoning (`AI_DELEGATION_MODEL`, `AI_DELEGATION_REASONING_EFFORT`); other OpenAI-compatible endpoints use chat completions. `AI_EMBEDDING_*` configures embeddings. The key falls back to `OPENAI_API_KEY`.
- `packages/embed/`: Vite bundle producing the IIFE widget loader (`dist/embed.js`, served at `/embed.js`, copied into `apps/admin/public/embed/` by `scripts/copy-widget-embed.mjs`).
- `packages/`: shared contracts, jobs, providers, telemetry, configuration, and test helpers.
- `docker/`, `docker-compose.yml`, and `scripts/`: local infrastructure, operations, migration, and certification tooling.

## Development commands

- `pnpm install`: install workspace dependencies.
- `docker compose up -d postgres redis`: start local infrastructure. Add `--profile minio` when testing the optional MinIO storage backend.
- `pnpm db:migrate`: apply PostgreSQL migrations.
- `pnpm dev`: run admin, worker, and landing apps. Browser calls need `LIVE_PROTOTYPE_ENABLED=true` and `OPENAI_API_KEY` on admin and worker.
- `pnpm typecheck`: typecheck all active workspaces and scripts.
- `pnpm test`: run all Vitest suites.
- `pnpm build`: build every workspace package and app (also copies the embed loader into the admin standalone output).
- `pnpm widget:embed:build`: rebuild `packages/embed` and copy the loader into `apps/admin/public/embed/`.

## Next.js MCP server

`.mcp.json` registers `next-devtools`, a Model Context Protocol (MCP) server from the `next-devtools-mcp` package. It works with `apps/admin`, the only Next.js app. `apps/landing` runs on Astro, so the server doesn't cover it. Use it like this:

- Call `nextjs_docs` before you write Next.js code or answer a Next.js question, then read the guide it points to in `apps/admin/node_modules/next/dist/docs/`. Those docs match the installed Next.js version, so use them over memory or web results.
- Start the admin dev server with `pnpm dev:admin` or `pnpm dev`. It listens on `ADMIN_PORT`, which defaults to 3000.
- Call `nextjs_index` to find the running server and list its tools. Then run a tool with `nextjs_call`: `get_errors`, `get_routes`, `get_page_metadata`, `get_logs`, `get_compilation_issues`, or `compile_route`.
- Before you change admin pages, layouts, route handlers, or Server Actions, check `get_routes` and `get_errors`. Call `get_errors` again after the change.
- If `nextjs_index` finds no server, start the admin dev server and call it again. Pass `port` when the server runs on a port other than 3000.
- `get_errors` reports build errors and errors from open browser sessions. You still need to run `pnpm typecheck`, `pnpm test`, and `pnpm build` before you open a PR.

## Coding style

- TypeScript ESM throughout; use 2-space indentation and LF line endings.
- Use `PascalCase` for React components and `camelCase` for functions and utilities.
- Keep durable business logic in `packages/domain` and persistence in `packages/db`.
- Add receptionist capabilities as agent-core tools backed by `packages/domain`, so website chat and calls share them.
- Keep voice personalization snapshot-based. Fetch a business snapshot at call start and avoid per-turn backend reads for common replies.

## Design system

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
- The interface languages are `en`, `fr`, `es`, and `sr`. Serbian uses Latin script only. Pass a locale through `intlLocale()` from `@lobbystack/shared` before you hand it to `Intl`, Luxon, `lang`, or `hreflang`, so `sr` becomes `sr-Latn`. A bare `sr` formats in Cyrillic.
- The AI receptionist speaks English and French only (`RuntimeLocale`). Keep business caller languages and voice prompts on that list.

## Testing

- Vitest is the default test runner; keep `*.test.ts` and `*.test.tsx` near their source.
- Test database behavior against PostgreSQL with the correct runtime role and RLS context.
- Prioritize booking, authz, webhook, outbox, snapshot, privacy, and telemetry regressions.
- Every new telemetry event must include a test that asserts it fires from its real production code path.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before opening a PR.
- When changing migrations or RLS, also run `pnpm db:check` and `pnpm db:verify-rls` against the test database.

## Migration guardrails

- PostgreSQL is the canonical runtime datastore.
- Retain `replacement:import`, `replacement:import-check`, and `replacement:reconciliation` until production cutover and rollback windows close.
- Retain `legacy_convex_id` lineage columns until migration reconciliation and rollback are complete.
- Convex references are allowed only in migration, cutover, rollback, and historical ADR documentation.
