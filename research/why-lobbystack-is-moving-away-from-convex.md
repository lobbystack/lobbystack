# Research: Why LobbyStack is moving away from Convex

## Claim boundaries

The article should distinguish repository evidence from business context supplied by the founder.

- **Founder-supplied business context:** Convex helped the team move fast at the start. It has worked well for LobbyStack and continues to serve current paying customers reliably. LobbyStack has not reached the product or contributor adoption the team expected.
- **Repository evidence:** Convex was the original source of truth and workflow engine. The platform-port branch replaces that runtime with Next.js, PostgreSQL, Drizzle, Redis, BullMQ, shared domain modules, and the existing Fastify voice gateway. The code port and parity work are present, while production data and traffic cutover remain gated.
- **Strategic interpretation for the article:** A conventional stack can reduce the amount of unfamiliar infrastructure that contributors, agencies, and self-hosters must evaluate. It also gives the project access to a broader pool of developers and operators who already know Next.js and PostgreSQL. Present this as LobbyStack's business judgment, not a measured comparison of ecosystem size.
- **Avoid:** Do not claim that Convex has poor adoption, failed technically, caused customer problems, or forced the migration. Do not invent signup, customer, contributor, or revenue figures.

## What the previous architecture did

At the branch point from `main`, Convex owned persistent state, business logic, booking, asynchronous workflows, and most provider orchestration. The React/Vite dashboard read from that backend, while a separate Fastify gateway handled Twilio Voice, Media Streams, OpenAI Realtime, and transfer control. See the historical [Convex backend ADR](https://github.com/lobbystack/lobbystack/blob/98df8990/docs/adr/0002-convex-main-backend.md) and [architecture overview](https://github.com/lobbystack/lobbystack/blob/98df8990/docs/architecture/overview.md).

The voice design already separated latency-sensitive audio from durable business state. Convex compiled business configuration and knowledge into a snapshot, and the voice gateway fetched that snapshot once at call start. The gateway called Convex only for authoritative actions such as booking and call state. This design explains how the original stack could serve live customers well without repeated backend reads during a call.

Convex also supplied integrated auth, RAG, agents, workflows, work pools, cron jobs, rate limiting, streaming, Polar, and Resend components. The historical [`package.json`](https://github.com/lobbystack/lobbystack/blob/98df8990/package.json) and [knowledge architecture](https://github.com/lobbystack/lobbystack/blob/98df8990/docs/knowledge/architecture.md) show the breadth of that integration.

The repository supports a balanced account of the old stack:

- The first MVP baseline on March 8, 2026 already included the Convex schema, business configuration, knowledge, booking, conversation webhooks, cron jobs, voice operations, a React dashboard, and the voice gateway in one commit. This supports the founder's account that Convex enabled rapid initial development, although the causal claim remains founder-supplied.
- Product work continued on the Convex design through July, including auth, billing, SMS, appointment changes, knowledge ingestion, web voice, teams, and agent rules.
- The old self-hosting flow required operators to start separate Convex backend and dashboard services, generate an admin key, synchronize Convex environment variables, and deploy Convex functions before starting the full product. The historical [README setup](https://github.com/lobbystack/lobbystack/blob/98df8990/README.md#self-hosted-docker-compose) documents those steps.

## What the replacement architecture does

The current [PostgreSQL ADR](../docs/adr/0007-postgresql-main-backend.md) and [platform guide](../docs/platform.md) define the new boundaries:

- `apps/admin` combines the Next.js dashboard, authentication, and HTTP API.
- PostgreSQL owns durable state. Drizzle defines the schema and explicit migrations, while role-specific clients and forced row-level security isolate tenant data.
- `packages/domain` holds business operations shared by the admin and worker, which reduces logic drift between runtimes.
- `apps/worker` runs asynchronous work through Redis and BullMQ. A transactional PostgreSQL outbox commits business changes and pending side effects together, then the worker dispatches them.
- Redis also supports realtime coordination and rate limiting.
- The Fastify voice gateway remains narrow. It loads a business snapshot at call start and calls signed admin-backend operations for authoritative work.
- Local file storage is the basic self-hosted path, with S3-compatible storage available when an operator needs it.

The public [README technology table](../README.md#technology) states the stack directly. The [database package](../packages/db/package.json), [jobs package](../packages/jobs/package.json), and [voice gateway package](../apps/voice-gateway/package.json) confirm the implementation dependencies.

## Technical and business rationale

Use the repository-backed rationale first:

- **Explicit operations:** PostgreSQL and Drizzle expose schema migrations, backups, restores, role permissions, RLS policies, and reconciliation as artifacts that operators can inspect and run.
- **Tenant controls:** The replacement stack creates least-privilege database roles and verifies forced RLS, tenant isolation, and actor-role spoofing protection.
- **Durable side effects:** The transactional outbox coordinates state changes with queued email, notification, billing, and other work. Deterministic BullMQ job IDs and recovery checks cover retries and Redis restarts.
- **Portable self-hosting:** The documented single-host path uses Docker Compose with PostgreSQL, Redis, the Next.js app, the worker, the voice gateway, and file storage. Operators can add S3-compatible storage without adopting a different application backend.
- **Stable voice path:** The migration preserves the separate Fastify gateway and snapshot-at-call-start design rather than rewriting the latency-sensitive audio runtime.

Then connect those choices to the founder's business decision:

- LobbyStack needs more users, self-hosters, contributors, integrators, and agency deployments.
- The original product worked for paying customers, but LobbyStack adoption did not reach the team's expectations.
- The team believes familiar infrastructure will shorten technical evaluation, clarify deployment requirements, and let more developers contribute without first learning a project-specific backend.
- This is a distribution decision based on LobbyStack's needs. Convex delivered the speed and reliability the team needed during the first stage.

## Exact port and production-cutover status

Safe launch wording: **“We completed the application code port. We have not moved paying-customer data or production traffic yet.”** The first clause is supported by the replacement, backend-parity, admin-parity, and runtime-removal commits below. The second clause comes from the founder and agrees with the current operational docs.

Current repository guardrails:

- Convex is no longer an active replacement-runtime dependency. It remains in import, reconciliation, cutover, rollback, compatibility telemetry names, and historical documentation. The [ADR](../docs/adr/0007-postgresql-main-backend.md#migration) requires migration tooling and `legacy_convex_id` lineage to remain until production cutover and the rollback window finish.
- The checked-in development importer accepts one named development deployment and rejects production-looking input. The [migration guide](../docs/migrations/convex-to-postgres.md) requires a separately approved production snapshot, isolated replacement database, reviewed identifier change, backup, dry run, reconciliation, and write freeze for the later production run.
- Import is designed to be idempotent. It derives stable UUIDs from Convex IDs, retains compatible password hashes for first-login rehashing, omits old opaque sessions, regenerates provider-specific embeddings, reports excluded component state, and copies available file data.
- The [certification runbook](../docs/validation/certification-runbook.md#rehearse-migration-and-cutover) blocks cutover on any unexplained row-count, relationship, aggregate, or sampled-record discrepancy. It also requires all automated and provider gates, a pre-cutover backup, a staging traffic switch, confirmation that required workflows no longer call Convex, a successful restore, a second cutover rehearsal, and retained release logs.
- Storage integrity belongs in the gate. The [platform guide](../docs/platform.md#back-up-and-restore-data) creates database and file checksums and requires a restore drill that proves database-row and object integrity.
- Production traffic switching, DNS changes, and Convex shutdown remain operator-controlled actions. Do not write that merging the branch itself performs those steps.

## Timeline supported by git history

- [March 8, 2026: MVP baseline](https://github.com/lobbystack/lobbystack/commit/27b3d111fb5113596dd8cec6f57528da2b73e852). The repository starts with Convex as the main backend, a React/Vite dashboard, and a separate voice gateway.
- [August 12: PostgreSQL/Next.js replacement platform](https://github.com/lobbystack/lobbystack/commit/00232e263e4eebf60b9a3a14bfe7092f2b47eb31). Adds the Next.js admin/backend, PostgreSQL and Drizzle, role pools, forced RLS, Redis/BullMQ, transactional outbox, shared packages, realtime coordination, and certification tooling.
- [August 14: replacement backend parity](https://github.com/lobbystack/lobbystack/commit/3fd2c9af10daa01429bc34b0b6fd9f0e882685f7). Restores the remaining scoped backend capabilities and adds import and reconciliation controls.
- [August 16: admin UI parity](https://github.com/lobbystack/lobbystack/commit/91b7ac866f0331259aed48a7ab0ce1f14f35b33f) followed by [legacy Convex runtime removal](https://github.com/lobbystack/lobbystack/commit/32d12006bdc5092feb00974ff330d5be1f76a04d).
- [August 18: guarded Convex development migration](https://github.com/lobbystack/lobbystack/commit/bcce74b70f1212ab992b2f8b3e0313bbf257d500). Adds the deployment-bound importer used to validate migration behavior without opening a production path.
- [August 30: local and configurable storage](https://github.com/lobbystack/lobbystack/commit/fd4c863ef4565664990da5fb7025dd84e17b27f3). Makes local storage the basic path while keeping S3-compatible storage available.

## Suggested article frame

**SEO title, 38 characters:** `Why LobbyStack is moving to PostgreSQL`

**Meta description:** `We are moving LobbyStack from Convex to PostgreSQL and Next.js to improve self-hosting and contribution, with strict production migration checks first.`

Suggested flow:

1. Open with the honest outcome: Convex worked, including for paying customers, but LobbyStack adoption fell short of the team's goal.
2. Credit the original architecture for turning an MVP into a working product sooner.
3. Explain why distribution now matters more than backend convenience for the next stage.
4. Show the new stack and the operational capabilities it makes explicit.
5. Separate the completed code port from the pending production migration.
6. Invite developers and agencies to inspect, run, and extend the new stack.

## Links and CTA

- **Primary developer CTA:** [Explore LobbyStack on GitHub](https://github.com/lobbystack/lobbystack).
- **Self-hosting CTA:** [Read the self-hosting overview](https://docs.lobbystack.com/self-hosting/overview) or [follow the Docker Compose guide](https://docs.lobbystack.com/self-hosting/docker-compose).
- **Managed-product CTA:** [Create a LobbyStack Cloud account](https://app.lobbystack.com/signup).
- **Related product page:** [See LobbyStack](https://lobbystack.com/).

Recommended closing idea: developers can inspect the migration and contribute to the conventional stack today; businesses that want the receptionist without operating infrastructure can use LobbyStack Cloud.
