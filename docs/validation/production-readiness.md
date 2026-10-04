# Production readiness

This is the production-readiness record for the replacement stack. It is a plan, not a certification. As of this revision, every production item is `BLOCKED` or `NOT-RUN`; no evidence record can set `releaseCertified` to `true`.

Use this document with the [certification runbook](./certification-runbook.md), the [current implementation validation report](./readiness-implementation-2026-09-12.md), and the [backup and restore runbook](../operations/backup-restore.md).

## Status and evidence

Current execution evidence: [2026-09-13 progress](./readiness-progress-2026-09-13.md). Earlier checklist `NOT-RUN` entries below refer to release certification, not to the completed local and isolated checks recorded there.

- `NOT-RUN`: the required command, observation, or rehearsal has not been completed.
- `BLOCKED`: a required control or approval does not exist or is not approved. A blocked item is not waived by a passing automated check.
- Owner for every item below is `UNASSIGNED` until an accountable person accepts it in the release record.
- Evidence must contain a run ID, UTC start and end time, owner, environment identity, deployed revision, command or manual procedure, result, artifact digest or stable artifact reference, reviewer, and disposition.
- Evidence may contain aggregate counts, hashes, timestamps, service versions, and redacted error codes. Do not place customer data, snapshot contents, credentials, provider secrets, or private-storage locations in this document or an evidence summary.

## Executable checklist

| Item | Owner | Status | Required evidence / exit condition |
| --- | --- | --- | --- |
| Release baseline | UNASSIGNED | NOT-RUN | Run `pnpm release:check --local --evidence <restricted-artifact>`; retain the JSON result and confirm every selected local gate passed. |
| Isolated staging gates | UNASSIGNED | NOT-RUN | Run `pnpm release:check --staging --evidence <restricted-artifact>` only with the isolated-staging environment contract satisfied; retain the result. |
| External release gates | UNASSIGNED | BLOCKED | Approved production backup/restore drill, paid-provider verification, and production rollout approval. `release:check` reports these as outstanding external gates and always reports `releaseCertified: false`. |
| Provider event plan | UNASSIGNED | BLOCKED | Provider-specific pause, retry, and reconciliation plan approved by the responsible provider owners. There is no durable inbound provider-event buffer. |
| Replacement maintenance | UNASSIGNED | NOT-RUN | Startup and probe evidence showing `LOBBYSTACK_MAINTENANCE_MODE=true` was set before worker startup, worker consumers did not start, admin exposed only health API probes, and the gateway exposed only liveness. |
| Traffic cutover and return | UNASSIGNED | BLOCKED | Approved traffic-switch procedure, monitored workflow results, and a separately rehearsed traffic rollback. A database/storage restore is not a traffic rollback. |
| Security and privacy review | UNASSIGNED | NOT-RUN | Required certification evidence, access review, and confirmation that release artifacts do not expose customer data or secrets. |

`pnpm release:check` is an installed package command. It does not constitute a production certification or an apply command.

## Scenario matrix

| Scenario | Owner | Status | Execute and record |
| --- | --- | --- | --- |
| Local release baseline | UNASSIGNED | NOT-RUN | Run `pnpm release:check --local`; record gate statuses and revision. |
| Isolated staging release baseline | UNASSIGNED | NOT-RUN | Run `pnpm release:check --staging`; verify the script rejects local targets, database names other than `certification` or `certification_<suffix>`, incorrect database roles, and role URLs that do not share one disposable database target. |
| Maintenance entry | UNASSIGNED | NOT-RUN | Restart replacement workers with maintenance enabled; verify consumers, schedulers, and provider startup are absent and worker readiness is false. |
| Maintenance API behavior | UNASSIGNED | NOT-RUN | Verify all admin `/api/*` requests other than `GET` or `HEAD` health probes return `503`, including webhook paths. |
| Gateway maintenance and readiness | UNASSIGNED | NOT-RUN | Verify the gateway accepts only `/health` and `/health/live` during maintenance; `/health/ready`, every voice route, and media-stream upgrades return or close with `503`. Verify its normal readiness probe is a signed empty-body `GET /voice/ready` and accepts only `{ "ok": true, "service": "lobbystack-voice", "readiness": "ready" }`. |
| Provider retry window | UNASSIGNED | BLOCKED | Demonstrate an approved provider pause or provider-owned retry/replay procedure without acknowledging events into a nonexistent durable buffer. |
| Traffic switch | UNASSIGNED | BLOCKED | Block until a switch plan defines DNS/routing, session handling, provider endpoints, observation period, and authority to proceed. |
| Traffic rollback | UNASSIGNED | BLOCKED | Block until a traffic rollback plan is rehearsed. Restore procedures recover state; they do not automatically restore legacy traffic, provider routing, or in-flight events. |

## Release harness boundaries

`pnpm release:check --e2e` is a local, disposable-fixture supplement to the local lint, typecheck, test, and build baseline. It runs only these five Playwright suites: `operator-auth.e2e.ts`, `widget-chat.e2e.ts`, `password-recovery.e2e.ts`, `website-import.e2e.ts`, and `demo-operator.e2e.ts`. It is not the customer-journey matrix below.

The `--e2e` profile requires all of the following before it executes:

| Requirement | Value |
| --- | --- |
| Worker state | `RELEASE_E2E_WORKER_PAUSED=1` |
| Browser base URL | `PLAYWRIGHT_BASE_URL` is local |
| Five role URLs | `REPLACEMENT_E2E_DATABASE_URL` as `lobbystack_migrator`; `LOBBYSTACK_APP_DATABASE_URL` as `lobbystack_app`; `LOBBYSTACK_AUTH_DATABASE_URL` as `lobbystack_auth`; `LOBBYSTACK_WORKER_DATABASE_URL` as `lobbystack_worker`; `LOBBYSTACK_DISPATCHER_DATABASE_URL` as `lobbystack_dispatcher` |
| Target matching | Every role URL is local and resolves to the same disposable database target |
| Fixture flags | `WIDGET_E2E=1`, `PASSWORD_RECOVERY_E2E=1`, `WEBSITE_IMPORT_E2E=1`, and `DEMO_OPERATOR_E2E=1` |
| Operator fixtures | `PARITY_PORT_OPERATOR_STORAGE_STATE_FR`, `PARITY_PORT_OPERATOR_STORAGE_STATE_EN`, and `PARITY_OPERATOR_USER_ID` are present |

The staging command is separate from these local fixtures. `pnpm release:check --staging` accepts only an `isolated-staging` certification deployment, non-local service endpoints, one disposable database target named exactly `certification` or `certification_<suffix>`, and the required role URLs. It requires `RESEND_WEBHOOKS_ENABLED` to be exactly `true` or `false`; when `true`, `RESEND_WEBHOOK_SECRET` is required, and when `false`, the release harness removes that secret from child gate environments. It must never point at a production snapshot database.

## Customer journey acceptance

These journeys are required production acceptance evidence, not claims of current coverage.

| Journey | Owner | Status | Acceptance evidence |
| --- | --- | --- | --- |
| Authentication, tenancy, and onboarding | UNASSIGNED | BLOCKED | Create and sign in operators, validate tenant isolation across roles, complete business and phone onboarding, and retain redacted authorization and audit outcomes. |
| Booking concurrency, DST, and calendar | UNASSIGNED | BLOCKED | Run simultaneous booking attempts for the same slot, verify one authoritative outcome, test a DST transition in both directions, and reconcile calendar availability and resulting appointments. |
| Voice | UNASSIGNED | BLOCKED | Exercise an inbound voice journey through greeting, information capture, booking or escalation, transfer behavior, and post-call record visibility; reconcile provider callback outcomes without recording customer content in repository evidence. |
| Website widget | UNASSIGNED | BLOCKED | Start a visitor conversation, preserve the visitor boundary, complete a booking or handoff, and verify reconnect and transcript visibility under the intended tenant. |
| Billing and delivery | UNASSIGNED | BLOCKED | Verify billing event handling, invoice or subscription state, notification delivery and status, idempotency, and provider retry/reconciliation behavior using approved non-customer fixtures. |
| Dashboard and public UX | UNASSIGNED | BLOCKED | Complete the operator dashboard workflows and public landing, login, demo, and embed paths; capture expected error, loading, and unavailable states. |
| English/French, desktop/mobile, accessibility | UNASSIGNED | BLOCKED | Execute the required journeys in `en` and `fr` at desktop and mobile viewports; retain accessibility-tree and keyboard/screen-reader evidence with no unresolved critical accessibility defect. |
| Operations soak | UNASSIGNED | BLOCKED | Run at least 30 continuous minutes under the documented representative load. Require ordinary API p95 below 500 ms excluding providers, realtime p95 below 500 ms, voice-context p95 below 300 ms, webhook durable-response p95 below 1 s, outbox dispatch p95 below 2 s, no unacknowledged critical alert, and no unexplained data-loss or reconciliation signal. |

