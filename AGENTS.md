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

## Testing Guidelines
- Vitest is the default test runner.
- Name tests `*.test.ts` or `*.test.tsx` and keep them close to the code they cover.
- Prioritize coverage for booking logic, snapshot generation, authz helpers, webhook handling, and telemetry redaction.
- Before opening a PR, run `pnpm typecheck`, `pnpm build`, and `pnpm test`.

## Architecture Guardrails
- `convex/` is the main backend. Do not move durable business logic into the voice gateway.
- For live calls, fetch the business context snapshot once at call start; avoid per-turn backend round-trips for common replies.
