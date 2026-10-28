# Repository guidelines

## Project structure

- `apps/admin/`: Next.js operator dashboard, authentication, and HTTP API. Hosts the embeddable widget API (`/api/widget/*`), the loader (`/embed.js`), and the widget iframe app (`/embed/[key]`) in addition to the dashboard. On the hosts in `MARKETING_HOSTS` it serves the marketing site instead, from `app/(marketing)`, `src/marketing` and `content/`; read `docs/deployment/marketing-site.md` before you change its proxy, routes or build steps.
- `apps/worker/`: asynchronous jobs, transactional outbox dispatch, and GPT-Live calls. The admin asks it to attach to each session at `/internal/live/attach`; it answers delegated requests, saves transcripts, and finishes the call. Phone calls reach GPT-Live through a Twilio Elastic SIP trunk; see `docs/voice/runtime.md`.
- `packages/db/`: Drizzle schema, PostgreSQL migrations, role-specific clients, and RLS helpers. See "Database" below.
- `packages/domain/`: durable business logic shared by admin and worker runtimes. Widget conversations use the `web_chat` channel and key on `widget_visitor_id` (no phone required).
- `packages/agent-core/`: the receptionist agent (AI SDK `ToolLoopAgent`) shared by website chat and calls, its tools, and the GPT-Live session config and call controller.
- `packages/providers/`: provider adapters (Twilio, embeddings, calendars, email). Text AI goes through the agent core: set `AI_CHAT_*` (`API_KEY`, `BASE_URL`, `MODEL`, `PROVIDER_NAME`, `REASONING_EFFORT`, `SERVICE_TIER`). On OpenAI the default is `gpt-6-luna` on high reasoning through the Responses API, except that GPT-Live delegation runs on low reasoning (`AI_DELEGATION_MODEL`, `AI_DELEGATION_REASONING_EFFORT`); other OpenAI-compatible endpoints use chat completions. `AI_EMBEDDING_*` configures embeddings. The key falls back to `OPENAI_API_KEY`.
- `packages/embed/`: Vite bundle producing the IIFE widget loader (`dist/embed.js`, served at `/embed.js`, copied into `apps/admin/public/embed/` by `scripts/copy-widget-embed.mjs`).
- `packages/web-voice/`: the React hook and voice orb behind the dashboard's browser test calls.
- `packages/cli/`: the `lobbystack` command. It works only through the v1 HTTP API, never the database, and takes its request and response types from the operation registry in `packages/shared/src/publicApi/operations.ts`. `mintlify/api/cli.mdx`, with its `fr/` and `es/` copies, documents `lobbystack onboard` and its manifest, so change them along with `packages/cli/src/onboard.ts` and `manifest.ts`. The manifest schema and the steps that apply it live in `packages/shared/src/businessSetup.ts`, which partner templates use too.
- `packages/contracts/`, `jobs/`, `shared/`, and `telemetry/`: contracts, queue jobs, utilities, and the telemetry event registry shared across runtimes.
- `integrations/zapier/`: the Zapier integration. It sits outside the pnpm workspace with its own `package-lock.json`; run `npm ci` and `npm test` inside it.
- `mintlify/`: the public Help Center at docs.lobbystack.com. Follow `mintlify/AGENTS.md` when you edit it.
- `docs/`: ADRs in `docs/adr/`, plus architecture, voice, deployment, operations, and telemetry notes. Specs go in `docs/specs/` and tickets in the gitignored `.scratch/`; `docs/agents/issue-tracker.md` gives the format.
- `docker/`, `docker-compose.yml`, and `scripts/`: local infrastructure, operations, and certification tooling.

`GLOSSARY.md` defines the domain language: business, partner, partner member, host, operator, affiliate, plan, tier, pool, package, allowance, and platform key. Use its terms, and skip the ones it lists under _Avoid_, in code, docs, and copy.

## Development commands

- `pnpm install`: install workspace dependencies.
- `docker compose up -d postgres redis`: start local infrastructure. Add `--profile minio` when testing the optional MinIO storage backend.
- `pnpm db:migrate`: apply PostgreSQL migrations.
- `pnpm dev`: run the admin and worker apps. Browser calls need `LIVE_PROTOTYPE_ENABLED=true` and `OPENAI_API_KEY` on admin and worker. The admin dev server reads `@lobbystack/telemetry` from its build through a Turbopack alias in `next.config.ts`. `pnpm dev:admin` rebuilds it on start, so restart the server after you change that package.
- `pnpm typecheck`: typecheck all active workspaces and scripts.
- `pnpm lint`: ESLint in `apps/admin`; the other workspaces run `tsc` as their lint.
- `pnpm test`: run all Vitest suites.
- `pnpm --filter @lobbystack/<workspace> exec vitest run <path>`: run one test file. Workspaces import each other's `src` through tsconfig paths and Vitest aliases, so tests need no build first.
- `pnpm build`: build every workspace package and app (also copies the embed loader into the admin standalone output).
- `pnpm widget:embed:build`: rebuild `packages/embed` and copy the loader into `apps/admin/public/embed/`. Commit the rebuilt `apps/admin/public/embed/embed.js`; CI fails when it differs from the build.
- `pnpm lobbystack <command>`: run the CLI from source. `pnpm lobbystack login --url <dashboard URL> --key <API key>` saves a profile in `~/.config/lobbystack/config.json`. For a platform key, `pnpm platform-key:create --name <name> --group <group> --owner-email <email>` writes the key to `.platform-keys/<prefix>.json` and prints its `PLATFORM_API_KEYS` entry. The key gets an API key's scopes; add `--create-businesses` or `--create-users` for the platform-only ones.

## Next.js

`apps/admin` is the only Next.js app, marketing site included. It runs Next.js 16.4 on Turbopack.

- Read the guide for what you're changing in `apps/admin/node_modules/next/dist/docs/` before you write Next.js code or answer a Next.js question. Those docs match the installed version, so use them over memory or web results.
- Start the dev server with `pnpm dev:admin` or `pnpm dev`. It listens on `ADMIN_PORT`, which defaults to 3000.
- The running dev server answers MCP requests at `/_next/mcp`, so you can query it with `curl` and no MCP client. Call `tools/list` for the current tools. Keep both `Accept` types; without them the server answers 406.

  ```bash
  curl -s http://localhost:3000/_next/mcp \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_errors","arguments":{}}}' \
    | sed -n 's/^data: //p'
  ```

- Before you change pages, layouts, route handlers, or Server Actions, call `get_routes` and `get_errors`. After the change, call `get_compilation_issues` and `get_errors` again. `get_errors` needs at least one page open in a browser first.
- To check a change in a real browser, follow `.agents/skills/next-dev-loop`. It needs the `agent-browser` CLI, version 0.31.1 or later, on your `PATH`.
- `.mcp.json` registers `next-devtools-mcp` for MCP clients that read that file. It calls the same endpoint and adds `nextjs_docs` for searching the bundled docs.

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
- A business's default caller language (`RuntimeLocale`) is `en`, `fr`, `es`, `sr` (Latin script), `de`, `pt` (Brazilian Portuguese), `it`, or `nl`, and calls open in it. GPT-Live then switches to the caller's language when they ask or clearly speak another one. Keep business default languages and voice prompts on the `RuntimeLocale` list; name a language for a model with `runtimeLocaleName()`.

## Writing

Load the matching skill from `.agents/skills/` before you write text people read, including text inside code such as UI strings and locale files:

- `copywriting`: copy for the marketing site, the dashboard, emails, and other product surfaces.
- `writing-guidelines`: docs, such as `docs/`, `mintlify/`, READMEs, ADRs, and specs.
- `stop-slop`: all of the above, plus blog posts, commit messages, PR descriptions, and any other prose.

## Testing

- Vitest is the default test runner; keep `*.test.ts` and `*.test.tsx` near their source.
- Test database behavior against PostgreSQL with the correct runtime role and RLS context.
- `*.integration.test.ts` files skip unless `LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL` points at a dedicated test database; they never read `DATABASE_URL`. A green `pnpm test` without it hasn't run them. `pnpm test:reliability` runs the main set, and the `database` job in `.github/workflows/ci.yml` lists the role URLs and other variables the rest need.
- Prioritize booking, authz, webhook, outbox, snapshot, privacy, and telemetry regressions.
- Every new telemetry event must include a test that asserts it fires from its real production code path. `pnpm telemetry:coverage` fails when an event in the registry has no producer.
- CI runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and the database and browser tests on every pull request.
- When changing migrations or RLS, also run `pnpm db:check` and `pnpm db:verify-rls` against the test database.
- When changing GPT-Live instructions, the call controller, or how calls end, run `pnpm voice:eval` before you open a PR and `pnpm voice:call` against staging before you merge. See `docs/voice/testing.md`.

## Database

- PostgreSQL is the canonical runtime datastore.
- Runtimes connect through `createDatabaseClient` as one of four roles: `lobbystack_app`, `lobbystack_auth`, `lobbystack_worker`, or `lobbystack_dispatcher`. Run tenant queries inside `withBusinessTransaction`, which sets the RLS context before your callback runs.
- Write each migration by hand as `packages/db/migrations/NNNN_name.sql` and add it to `SCHEMA_MIGRATIONS` in `packages/db/src/migrations/raw-migrations.ts`; a test fails when the two disagree. A new table's migration enables and forces row-level security and adds a policy, or `pnpm db:verify-rls` fails. Update the Drizzle schema in `packages/db/src/schema/` when tables change. `migrations/generated/` holds only the initial Drizzle baseline.
- `legacy_convex_id` columns hold IDs from the previous Convex platform, which appears otherwise only in historical ADRs and blog posts. The Polar webhook business lookup, the finance export, and call and contact ID display still read them.
