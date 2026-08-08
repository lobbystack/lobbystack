# Replacement Platform Baseline Inventory

Recorded from the production Convex/Vite stack (`apps/web`, `convex/`) before the
PostgreSQL/Next.js replacement. Production remains on Convex until a later cutover.

## Baseline commands (main branch)

| Command | Result |
|---------|--------|
| `pnpm typecheck` | Pass |
| `pnpm build` | Pass (including `@lobbystack/admin` standalone) |
| `pnpm test` | Pass (admin runs focused unit tests; full UI tests remain in `apps/web`) |

## Route inventory (`apps/web/src/App.tsx`)

- Public/auth: `/login`, `/signup`, `/forgot-password`, `/confirm-email-change`, `/accept-invite`
- Demos: `/demo`, `/demo/:token`, `/claim-demo`
- Onboarding: `/onboarding/business` through `/onboarding/attribution`
- Workspace: `/`, `/calls`, `/calls/:callId`, `/messages`, `/analytics`, `/contacts`,
  `/contacts/:contactId`, `/agent/*`, `/integrations`, `/setup-guide`, `/affiliate`
- Settings: `/settings/team`, `/settings/appearance`, `/settings/phone-number`,
  `/settings/plan`, `/settings/plan/ai-sms-compliance`, `/settings/usage`,
  `/settings/notifications`, `/settings/account`

`apps/admin` mirrors these routes via the Next.js App Router.

## Convex durable model

69 tables in `convex/schema.ts` covering auth, tenancy, catalog, booking, voice,
conversations, knowledge, calendar, billing, affiliates, compliance, and operations.

PostgreSQL schemas in `packages/db/src/schema/` provide equivalent domains with
UUID primary keys and optional `legacyConvexId`.

## Replacement stack (this branch)

| Component | Location |
|-----------|----------|
| Next.js admin + API | `apps/admin` |
| BullMQ worker | `apps/worker` |
| PostgreSQL + Drizzle + RLS | `packages/db` |
| Domain services | `packages/domain/src/server` |
| Contracts | `packages/contracts` |
| Job contracts | `packages/jobs` |
| OTel + PostHog | `packages/telemetry` |
| Providers | `packages/providers` |
| Docker Compose | `docker-compose.replacement.yml` |

## Out of scope (later migration project)

Production data export/import, webhook DNS cutover, Convex shutdown.
