# Run the LobbyStack platform

The canonical stack provides a Next.js admin/backend, PostgreSQL with RLS, Redis/BullMQ, shared local storage, and the voice gateway. You can enable the MinIO profile when you need S3-compatible storage. Convex remains relevant only as the production migration source until cutover and rollback are complete.

## Run the local stack

1. Copy `.env.example` to `.env` and replace every development secret before exposing the stack.
2. Start the stack with `docker compose --env-file .env -f docker-compose.yml up --build`.
3. Open `http://localhost:13000` for the admin application, or `http://localhost` when using Caddy.
4. Add `--profile minio` and set `STORAGE_PROVIDER=s3` when a certification run requires MinIO. The MinIO console listens on `http://localhost:9001`.
5. Use `docker compose --env-file .env -f docker-compose.yml --profile development up mailpit` for local email inspection.
6. Set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` when you want direct export to an OTLP-compatible backend.

Keep each `LOBBYSTACK_*_DATABASE_URL` password synchronized with its matching `LOBBYSTACK_*_PASSWORD` value. The Postgres init script creates the least-privilege runtime roles from those variables.

Shell variables take precedence over values from `--env-file`. Unset stale replacement variables or run Compose from a clean environment when switching between local stacks.

The one-shot `migrator` service applies Drizzle migrations, roles, RLS policies, resolver functions, pgvector, booking concurrency constraints, and Better Auth normalization before the admin and worker start.

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `EMAIL_FROM` to enable verification, password-reset, and email-change delivery. Auth callbacks write durable `email.send` outbox messages; the worker performs SMTP delivery.

## Check service health

- Admin liveness: `http://localhost:13000/api/health/live`
- Admin readiness: `http://localhost:13000/api/health/ready`
- Worker liveness: `http://localhost:13002/health/live`
- Worker readiness: `http://localhost:13002/health/ready`
- Voice liveness: `http://localhost:13001/health/live`
- Voice readiness: `http://localhost:13001/health/ready`
- PostgreSQL: `localhost:15433`
- Redis: `localhost:16380`
- Local storage: the `storage_data` Docker volume
- MinIO API with the `minio` profile: `localhost:9000`

## Certify the local stack

Run these checks against the healthy Compose stack:

- `pnpm replacement:smoke` verifies core service liveness and readiness.
- `pnpm replacement:internal` verifies signed voice access through the worker database role and rejects nonce replay.
- `pnpm replacement:storage` verifies the S3 upload/finalize/download lifecycle, byte ranges, and cross-tenant denial against PostgreSQL and MinIO. Start the MinIO profile before running it.
- `pnpm replacement:realtime` creates an isolated Better Auth fixture, rejects unauthenticated and cross-tenant SSE access, validates every realtime event type, checks reconnect delivery, and enforces the 500 ms local p95 target.
- `pnpm replacement:webhooks` verifies Polar Standard Webhooks, optional Resend/Svix webhooks, and Twilio signatures, rejects tampered requests, and confirms duplicate provider delivery remains idempotent.
- `pnpm replacement:telemetry` runs an in-process OTLP receiver, verifies correlated cross-service traces plus metrics and logs, and rejects customer identifiers, credentials, prompts, transcripts, object keys, customer filenames, or signed storage URLs.
- `pnpm replacement:security` checks admin/browser import boundaries, CSP directives, SSRF rejection, upload validation, and storage telemetry redaction without external credentials.
- `pnpm replacement:recovery` proves deterministic duplicate job IDs, transactional outbox publication, Redis client reconnect, and, when `RECOVERY_COMPOSE_PROJECT` is supplied, post-restart dispatcher recovery. Set `RECOVERY_CHECK_WORKER=1` with the production queue prefix to also restart the worker and prove a post-restart global job completes.
- `pnpm replacement:performance` measures concurrent admin, worker, and voice readiness paths against the plan’s 500 ms API and 300 ms voice-context local p95 targets.
- `pnpm replacement:auth` proves a legacy Lucia Scrypt password is accepted at Better Auth sign-in, rehashed to the tagged replacement format, persisted on both the credential account and user, and still works on a repeated sign-in.
- `pnpm replacement:email-send` drives the worker `email.send` handler through a live SMTP conversation with an in-process sink, verifying transactional delivery, a stable privacy-safe Message-ID across retries, and no secret leakage.
- `pnpm replacement:sms-consent` proves contact and operator consent, duplicate webhook idempotency, manual-block preservation, dispatch-time rechecks, cross-tenant denial, and immutable consent history. AI-generated SMS is not part of the replacement backend.
- `pnpm replacement:parity` enforces the scoped non-UI capability manifest. Required capabilities must name implementation, test, and certification evidence; excluded AI SMS and Twilio A2P patterns are rejected from replacement backend sources.
- `pnpm replacement:privacy` proves message scrubbing, selective transcript expiry, attachment cleanup, and recording deletion through the transactional outbox and live worker. Its S3 checks require the MinIO profile.
- `pnpm replacement:notifications` proves operator preference persistence, cross-tenant denial, durable outbox-backed delivery, duplicate event safety, production-source delivery for voice messages, customer SMS, failed SMS, calendar sync failures, and transfer failures, plus idempotent timezone-aware daily summaries.
- `pnpm replacement:billing` verifies multi-kind usage, retries, annual accounting, plan snapshots, concurrent reservations, authorization, cap removal, completeness, and shared Starter/Pro overage caps.
- `pnpm replacement:feedback`, `pnpm replacement:appointment-audits`, and `pnpm replacement:unit-economics` certify the remaining restored backend capabilities.
- `pnpm replacement:import-check` imports a representative legacy bundle twice and requires row-count, relationship, aggregate-total, and sample reconciliation to pass.
- `pnpm replacement:phone-onboarding` proves durable verification, signed number offers, idempotent onboarding and replacement claims, purchase-before-retirement replacement, the 30-day retirement window, provider-SID-safe reclaim, cooldown enforcement, approval, and verified-phone reuse.
- `VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls` verifies forced RLS, tenant isolation, and database actor-role spoofing protection.

The certification scripts remove their temporary database rows and storage objects before exiting.

## Back up and restore data

`pnpm replacement:backup` stops the admin, worker, and voice gateway while it creates a PostgreSQL custom dump and copies the active storage backend under `.replacement-backups/`. It snapshots the shared volume for local storage and mirrors the MinIO bucket for S3 storage. Pass a destination after `--` to store the artifact elsewhere. Every artifact includes database and file checksums.

Restore is destructive. Verify that the destination stack and `REPLACEMENT_ENV_FILE` are correct, set `REPLACEMENT_COMPOSE_PROJECT` explicitly, then run `CONFIRM_REPLACEMENT_RESTORE=1 pnpm replacement:restore -- /secure/path/backup_directory`. The restore recreates the `lobbystack` database, replaces the configured file storage contents, and flushes Redis so queued work from the newer state cannot replay against restored durable data. The script restarts the runtime services that were running before the restore.

Run `REPLACEMENT_COMPOSE_PROJECT=lobbystack_restore_drill CONFIRM_REPLACEMENT_RESTORE_DRILL=1 pnpm replacement:restore-drill` against a disposable local stack to prove database-row and object integrity through deletion and full restore. The drill is intentionally destructive to changes made after its snapshot and retains its backup under `.tmp/` for inspection.

## Deploy the cloud services

Railway should run separate `admin`, `worker`, `voice-gateway`, `postgres`, `redis`, and bucket services. Set `BACKEND_INTERNAL_URL` on the gateway to the private admin URL. Keep `INTERNAL_SERVICE_SECRET`, database URLs, Better Auth secrets, provider credentials, and S3 credentials in Railway variables, never in the repository.

Build runtime images with `SERVICE_VERSION` set to the deployed Git SHA. Configure telemetry retention and sampling in the OTLP backend.

Production traffic cutover, DNS changes, and Convex shutdown remain operator-controlled actions. Import and reconciliation tooling is included but must first be run against a disposable restored production snapshot and rollback-tested staging environment.

The replacement stack implements non-AI usage metering for voice seconds, alert/reminder SMS segments, and outbound transfer attempts, including shared overage caps for Starter and Pro. Dashboard feedback delivery and appointment-change audit events are persisted through PostgreSQL and the transactional outbox. Run `pnpm replacement:import -- --input=convex_export.json` for an idempotent import and `pnpm replacement:reconciliation -- --source=convex_export.json` for the required report.

Configure separate Polar meter IDs with `POLAR_VOICE_USAGE_METER_ID`, `POLAR_ALERT_SMS_USAGE_METER_ID`, and `POLAR_OUTBOUND_ATTEMPTS_USAGE_METER_ID`. `POLAR_USAGE_METER_ID` remains a fallback for existing deployments.

Use `docs/deployment/railway.md` for Railway service configuration, `docs/operations/backup-restore.md` for recovery, `docs/operations/alerts.md` for critical alert response, and `docs/validation/certification-runbook.md` for the staging exit gate.
