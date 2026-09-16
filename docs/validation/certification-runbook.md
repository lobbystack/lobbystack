# Certify the Next.js platform

Run certification against an isolated Compose or Railway staging environment and attach results to the release record.

## Run automated gates

Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, two consecutive `pnpm db:migrate` runs, `pnpm replacement:parity`, `pnpm replacement:drift`, `pnpm replacement:security`, `pnpm replacement:recovery`, `pnpm replacement:performance`, `pnpm replacement:auth`, `pnpm replacement:email-send`, `pnpm replacement:sms-consent`, `pnpm replacement:feedback`, `pnpm replacement:appointment-audits`, `pnpm replacement:unit-economics`, `pnpm replacement:notifications`, `pnpm replacement:billing`, `pnpm replacement:import-check`, `pnpm replacement:phone-onboarding`, `pnpm replacement:call-detail`, `pnpm replacement:roles`, `pnpm replacement:locale`, `pnpm replacement:smoke`, `pnpm replacement:internal`, `pnpm replacement:storage`, `pnpm replacement:realtime`, `pnpm replacement:webhooks`, `pnpm replacement:telemetry`, `pnpm replacement:privacy`, and `VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls`. Run the authenticated Playwright suite from CI.

## Isolated staging contract

`pnpm release:check --staging` validates its configuration before running the gate scripts and rejects local endpoints. Run it from a runner with network access to the isolated certification deployment, with:

- `RELEASE_CERTIFICATION_TARGET=isolated-staging`.
- Non-local `ADMIN_BASE_URL`, `WORKER_BASE_URL`, `VOICE_BASE_URL`, `REDIS_URL`, and `REPLACEMENT_S3_ENDPOINT`, plus a non-local `REPLACEMENT_REDIS_HOST`.
- `DATABASE_URL`, `REPLACEMENT_MIGRATOR_DATABASE_URL`, `REPLACEMENT_APP_DATABASE_URL`, and `REPLACEMENT_WORKER_DATABASE_URL` resolving to the same disposable database named exactly `certification` or `certification_<suffix>`, using the `lobbystack_migrator`, `lobbystack_app`, and `lobbystack_worker` roles respectively.
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `POLAR_WEBHOOK_SECRET`, `TWILIO_AUTH_TOKEN`, `INTERNAL_SERVICE_SECRET`, `REDIS_PORT`, and `REPLACEMENT_TEST_BUSINESS_SLUG` (must start with `certification-`).
- `RESEND_WEBHOOKS_ENABLED` set to exactly `true` or `false`; when `true`, `RESEND_WEBHOOK_SECRET` is required.

Every gate script has been verified against a local isolated stack; the remaining requirement is the isolated-staging environment itself (non-local endpoints and a `certification` database reachable by the runner).

## Verify rendered UI coverage

Use `docs/validation/admin-ui-parity.json` as the route/state inventory and freeze the reference at its recorded commit. Capture paired main and port fixtures with `scripts/admin-ui-visual-certify.mjs`; loading, invitation and new operator states use the separate harnesses listed in the manifest. Keep equivalent fixture data, locale, theme and viewport on both sides. Do not update a main reference snapshot from the port.

Register the passing cohorts in `docs/validation/parity-visual-evidence.json`, then run `pnpm replacement:visual-coverage`. The gate reads the Playwright results, rejects failed or flaky cohorts, verifies paired reference tests, and independently compares saved rendered PNGs at zero color tolerance with a maximum difference ratio of `0.001`. It requires accessibility-tree evidence and every declared non-excluded variant. Missing artifacts fail the gate. New operator and compatibility routes have their own baselines and are identified separately from main comparisons.

Retain the evidence inventory, coverage report, screenshots, accessibility snapshots, traces and run logs with the release artifacts. Passing this gate proves the declared matrix only; audit missing states and complete the functional, database and live-provider gates before release.

## Verify recovery and operations

Verify Redis, worker, admin, and voice-gateway restarts. Perform PostgreSQL and object restore drills. Confirm SSE reconnects, outbox work resumes, telemetry outages do not block requests, and each alert in `docs/operations/alerts.md` fires and resolves.

## Test provider scenarios

Using staging credentials, verify signup and SMTP, Google OAuth and reconciliation, Twilio voice booking and cancellation, recordings, inbound and outbound SMS status, Polar billing, knowledge extraction and embeddings, and PostHog traces, logs, metrics, product opt-out, and replay exclusions.

For replay exclusions, confirm a consented workspace produces a recording, that call detail transcripts and the recording player are masked in playback, and that sessions on `/login`, `/demo/*`, and `/embed/*` produce no recording.

AI-generated SMS, AI-SMS add-on billing, and Twilio A2P registration are excluded. Before production alert or reminder SMS, retain evidence that the configured sender is independently compliant for the target countries and traffic type.

## Rehearse migration and cutover

Follow [production readiness](./production-readiness.md), the [current implementation validation report](./readiness-implementation-2026-09-12.md), and [production migration rehearsal](../migrations/production-rehearsal.md). Production migration and traffic cutover are not certified by this runbook.

1. Run the two snapshot rehearsals only after their approval, isolation, provider, and legacy-freeze prerequisites are met.
2. Run the audit-only `pnpm migration:preflight` command against each approved snapshot. It rejects apply, remains production-uncertified, and does not establish archive-to-unpacked provenance from a hash alone.
3. Do not use the development-only curated importer with a production snapshot. A separate fail-closed production importer now exists (`scripts/migration/production-import.ts`, `pnpm migration:production-import`) with approval, maintenance, target-identity, policy, and plan-hash gates; it still requires review, a provisioned and approved target, and human approval before any apply.
4. Run all automated gates and provider scenarios against isolated staging, including `pnpm release:check --staging`. This target is a disposable certification deployment, never a production snapshot database.
5. Use `pnpm migration:reconcile` (`scripts/migration/target-reconciliation.ts`) for source-to-target reconciliation. It compiles the snapshot plan and compares every import table plus plan-generated tables, field values, foreign-key orphans, transformations, financial aggregates, derived presence, storage objects, operational state, and indexes; it is read-only and writes only a restricted evidence report. It still requires a migrated target and review; `pnpm replacement:reconciliation` remains a narrower legacy check.
6. Run a state restore drill under [backup and restore](../operations/backup-restore.md), but do not record it as traffic rollback evidence. Traffic rollback needs its own approved and rehearsed routing, provider, session, and in-flight-event procedure.

## Apply the exit gate

Certification passes only when RLS and pool-context isolation pass, telemetry contains no customer content, realtime p95 is below 500 ms, ordinary API p95 is below 500 ms excluding providers, voice context p95 is below 300 ms, webhook durable response p95 is below one second, outbox dispatch p95 is below two seconds, restore succeeds, critical alerts are tested, the approved migration reconciliation criteria have no unexplained differences, a traffic rollback rehearsal succeeds, required workflows have no Convex dependency, compliant SMS sender evidence is attached, and no critical defects remain. The production importer and reconciler now exist and pass against local disposable targets; production migration certification remains blocked on the isolated-staging run, provider and owner approvals, two approved clean-target rehearsals, the traffic rollback rehearsal, and production rollout approval.

## Publish the platform-port articles

Immediately before merging the platform-port branch, replace the provisional `pubDate` in both English and French platform-port articles with the actual merge date. Run the landing i18n tests, typecheck, and production build after changing the dates. Ship the articles with the branch; do not deploy them separately.
