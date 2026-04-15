# Repository Guidelines

## Project Structure & Module Organization
- `apps/web/`: React + Vite admin dashboard.
- `apps/voice-gateway/`: narrow Node.js runtime for Twilio Voice, Media Streams, and OpenAI Realtime.
- `convex/`: primary backend and source of truth for auth, business state, booking, knowledge, and workflows.
- `packages/`: shared TypeScript libraries (`ai`, `config`, `domain`, `providers`, `shared`, `telemetry`, `testing`).
- `docs/`: architecture notes, ADRs, provider docs, and Linear tracking docs.
- `docker/` and `scripts/`: local ops and seed helpers.

Do not edit generated files in `convex/_generated/` by hand.

## Build, Test, and Development Commands
- `pnpm install`: install workspace dependencies.
- `pnpm convex dev`: start Convex dev, generate backend types, and sync components.
- `pnpm dev`: run Convex, web, and voice gateway together.
- `pnpm build`: build every workspace package and app.
- `pnpm typecheck`: run TypeScript checks across the monorepo.
- `pnpm test`: run all Vitest suites.
- `pnpm seed:demo`: seed demo tenants and sample data.

## Coding Style & Naming Conventions
- TypeScript ESM throughout; use 2-space indentation and LF line endings per `.editorconfig`.
- Use `PascalCase` for React components, `camelCase` for functions/utilities, and descriptive domain folders under `convex/` (for example `convex/appointments/booking.ts`).
- Keep voice personalization snapshot-based: structured business facts stay authoritative in Convex; RAG augments documents and FAQs only.
- Prefer `rg` for search. Use `apply_patch` for manual edits. Add TSDoc/JSDoc only for exported or non-obvious modules.

## Design System Guidelines
- Treat `shadcn/ui` as the default UI system for `apps/web`. Prefer composing existing shadcn primitives over custom wrappers when the primitive already solves the problem well.
- Preserve shadcn component structure, variants, accessibility, and interaction behavior. Do not restyle component internals unless the change is clearly about spacing or consistency.
- Use Geist Sans as the primary sans-serif font across the web app.
- Use Lucide as the only icon set in `apps/web`. Do not introduce Tabler, Heroicons, or mixed icon families for operator UI work.
- Keep the UI on a 4px base grid with an 8px default major rhythm.
- Use this spacing scale for layout and component spacing: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128`.
- Prefer Tailwind spacing utilities from that scale. Avoid arbitrary spacing values like `p-[3px]`, `top-[0.3rem]`, or one-off offsets unless geometry or animation truly requires them.
- Use explicit radius tokens. Avoid bare `rounded` in `apps/web`; pick a named size or an allowed documented exception.
- Default radius tiers in `apps/web`:
  - `rounded-sm` for micro affordances and inline chips such as keyboard shortcuts or tiny copy buttons
  - `rounded-md` for inputs, selects, menu items, search fields, row actions, and other standard controls
  - `rounded-lg` for compact secondary panels, popovers, and media frames
  - `rounded-xl` for cards, dialogs, drawers, and primary operator surfaces
  - `rounded-2xl` for emphasized empty states, upload targets, and other deliberately softened callouts
  - `rounded-3xl` for auth/onboarding hero surfaces only
  - `rounded-full` for pill buttons, badges, nav pills, avatars, toggles, progress bars, and circular icon wells
- Allowed radius exceptions:
  - `2px` to `4px` only for microscopic geometry such as checkbox corners, chart swatches, and tooltip arrows
  - asymmetric `16px` message bubbles for threaded conversation UI and transcript/chat surfaces
- Normalize spacing decisions across the app:
  - icon gap: `8`
  - button horizontal padding: `16`
  - button vertical padding: `12`
  - input padding: `12` or `16`
  - card padding: `24`
  - internal card gaps: `12` or `16`
  - section spacing: `64` or `96`
- Keep page-level rhythm consistent across dashboard surfaces. Similar pages should use the same top spacing, bottom spacing, section gaps, and card gutters unless there is a clear product reason not to.
- When adjusting existing UI, prioritize consistency over pixel-perfect preservation of older bespoke spacing.
- Do not redesign pages during spacing cleanup. Preserve colors, typography choices, copy, logic, responsiveness, and route architecture unless the task explicitly asks for a broader visual change.

## Localization Guidelines
- Use translation keys for new dashboard UI copy under `apps/web/`; do not add new hardcoded user-facing English strings when the text belongs in the operator UI.
- Keep locale files in `apps/web/public/locales/{lng}/{ns}.json` and group keys by feature/intent rather than by component implementation details.
- Avoid string concatenation in translated sentences. Prefer interpolation through the translation layer instead.
- Keep translated text separate from date, time, and number formatting. Use the active locale with `Intl` or Luxon for formatting instead of baking localized formats into translation strings.

## Testing Guidelines
- Vitest is the default test runner.
- Name tests `*.test.ts` or `*.test.tsx` and keep them close to the code they cover.
- Prioritize coverage for booking logic, snapshot generation, authz helpers, webhook handling, and telemetry redaction.
- For Convex behavior, follow the official Convex testing guidance and prefer `convex-test` with the real schema over ad hoc mocked `ctx.db` chains.
- Put Convex-backed regression tests in `convex/tests/`. Keep pure helper tests next to the `convex/` module they cover.
- Use the `edge-runtime` Vitest environment for `convex-test`, and import the shared module map from `convex/test.setup.ts` when creating the test harness in this repo.
- Default Convex harness pattern in this repo:
  - `import { modules } from "../test.setup"`
  - `const t = convexTest(schema, modules)`
  - use `await t.run(async (ctx) => ...)` for deterministic fixture setup and direct DB assertions
  - use `t.query(...)`, `t.mutation(...)`, and `t.action(...)` with generated `api` / `internal` references instead of calling handlers directly
  - use `t.withIdentity({ subject: ... })` when testing membership, auth, or other identity-sensitive behavior
- Reach for `convex-test` whenever the behavior depends on indexes, auth boundaries, document mutations, internal/public function contracts, or snapshot regeneration. Keep pure string/data helpers as normal unit tests.
- Prefer function-level Convex tests by default. Do not register Convex components such as `RAG`, `Workpool`, or `Agent` unless the ticket is specifically about component integration behavior.
- Keep pure data and string helpers as normal Vitest unit tests, but test index-dependent reads, auth-sensitive flows, and Convex document mutations against the in-memory Convex backend.
- Before opening a PR, run `pnpm typecheck`, `pnpm build`, and `pnpm test`.
- If you change `convex/schema.ts` or add/remove persisted Convex fields, also run `pnpm convex dev` against the real dev deployment before calling the work review-ready. Tests and typecheck do not catch legacy document/schema mismatches in existing deployment data.
- For schema changes on existing tables, explicitly consider legacy compatibility: older documents may be missing newly required fields or may still contain removed fields. Prefer optional fields, compatibility fallbacks, or an intentional migration plan over assuming clean data.

## Architecture Guardrails
- `convex/` is the main backend. Do not move durable business logic into the voice gateway.
- For live calls, fetch the business context snapshot once at call start; avoid per-turn backend round-trips for common replies.
```

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
