# Production rollout plan

**Status:** production standby provisioned; **no cutover performed.** As of 2026-09-16 the Railway `production` environment `17162691-75e0-494a-8318-0233cbecf2e0` contains the replacement services, an isolated PostgreSQL/Redis/bucket, and the migrated (empty) schema, all healthy. No production data has been imported, no DNS record or provider endpoint points at production, and the legacy system still serves all traffic. Importing production data, changing DNS or provider endpoints, freezing the legacy system, and switching traffic remain irreversible or externally visible and are still gated on the entry criteria above and the go/no-go in section 8.

Use with [production readiness](../validation/production-readiness.md), the [certification runbook](../validation/certification-runbook.md), the [production migration rehearsal](../migrations/production-rehearsal.md), the [traffic cutover/rollback runbook](./traffic-cutover-rollback.md), the [provider ingress plan](./provider-ingress-plan.md), the [legacy write-freeze runbook](./legacy-write-freeze.md), and the [isolated target evidence](./isolated-rehearsal-target.md).

## 1. Entry criteria

| Criterion | State |
| --- | --- |
| Immutable release candidate | Local commit `faac87ba2da5a1980551aa3ff3209f72645a5974` (adds the database role-login bootstrap); clean baseline `e8db9938-0c01-4fd1-91a3-fde2850a34a2` passed. Not pushed. |
| Local release baseline | Passed (lint/typecheck/test/build). |
| Staging gate scripts | All pass against a local isolated stack; `release:check --staging` still requires the isolated-staging contract. |
| Production importer + reconciliation | Implemented and green on two clean local targets. Human review and a provisioned target still required. |
| Polar sandbox lifecycle | Complete. |
| Legacy freeze rehearsal | Passed against the development deployment; production freeze not tested. |
| Traffic switch/rollback | Runbook drafted; not rehearsed. |
| Provider event plan | Drafted; provider-owner approval outstanding. |
| Production rollout approval | **Missing.** |

Do not provision production or change any production routing, provider endpoint, or legacy write state until the entry criteria are approved and the go/no-go in section 8 is signed.

## 2. Production resource plan

Create in the `production` environment (same project `lobbystack`, region `us-east4-eqdc4a` unless changed):

| Resource | Type | Notes |
| --- | --- | --- |
| `admin` | Service, `Dockerfile.admin` | Healthcheck `/api/health/ready`; public domain. |
| `worker` | Service, `Dockerfile.worker` | Healthcheck `/health/ready`; private. |
| `voice-gateway` | Service, `Dockerfile.voice-gateway` | Healthcheck `/health/ready`; public domain for Twilio. |
| `migrator` | Service, `Dockerfile.migrator` | Run-once; `restartPolicyType: NEVER`. |
| `Postgres` | `pgvector/pgvector:pg16` + volume | Production database with a separate volume from staging/rehearsal. |
| `Redis` | `redis:7-alpine` + volume | `requirepass`, `appendonly yes`. |
| bucket | S3-compatible | Production storage; separate from `parity-certification`. |

Regions, volume sizes, and replica counts are operator decisions; production must not share a database, Redis, bucket, or volume with staging or the rehearsal environment.

## 3. Environment variables (names only)

Set the following in the production environment. Reuse the exact names from `.env.example` and the staging IaC (`.railway/railway.ts`). Values come from the production secret store and must not be copied from staging or the sandbox.

- **admin:** `APP_BASE_URL`, `AUTH_TRUSTED_ORIGINS`, `SITE_URL`, `NEXT_PUBLIC_*`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_USE_SECURE_COOKIES`, `ENCRYPTION_KEY`, `OTP_HASH_SECRET`, `NUMBER_CLAIM_TOKEN_SECRET`, `WIDGET_SESSION_SECRET`, `INTERNAL_SERVICE_SECRET`, `INTERNAL_SERVICE_TOKEN`, `DASHBOARD_TEST_CALL_TOKEN`, `LOBBYSTACK_APP_DATABASE_URL`, `LOBBYSTACK_AUTH_DATABASE_URL`, `LOBBYSTACK_WORKER_DATABASE_URL`, `LOBBYSTACK_DISPATCHER_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`, `REDIS_PREFIX`, `S3_*`, `STORAGE_PROVIDER`, `SMTP_*`, `EMAIL_FROM`, `FEEDBACK_TO_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_SMS_WEBHOOK_URL`, `TWILIO_STATUS_CALLBACK_URL`, `TWILIO_ALERT_*`, `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_API_BASE_URL` (production URL), `POLAR_WEBHOOK_SECRET`, `POLAR_*_PRODUCT_ID`, `OPENAI_API_KEY`, `POSTHOG_*`, `OTEL_*`, `REQUIRE_EMAIL_VERIFICATION`, `SEND_VERIFICATION_EMAIL_ON_SIGNUP`, `NODE_ENV`, `PORT`, `DEPLOYMENT_MODE`.
- **worker:** `LOBBYSTACK_WORKER_DATABASE_URL`, `LOBBYSTACK_DISPATCHER_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`, `REDIS_PREFIX`, `S3_*`, `STORAGE_PROVIDER`, `SMTP_*`, `EMAIL_FROM`, `TWILIO_*`, `POLAR_*`, `OPENAI_API_KEY`, `GOOGLE_*`, `ENCRYPTION_KEY`, `OTP_HASH_SECRET`, `APP_BASE_URL`, `POSTHOG_*`, `OTEL_*`.
- **voice-gateway:** `BACKEND_INTERNAL_URL`, `VOICE_GATEWAY_BASE_URL`, `INTERNAL_SERVICE_SECRET`, `INTERNAL_SERVICE_TOKEN`, `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `REDIS_URL`, `REDIS_PREFIX`, `WEB_CALL_ALLOWED_ORIGINS`, `DASHBOARD_TEST_CALL_TOKEN`, `POSTHOG_*`, `OTEL_*`.
- **migrator:** `LOBBYSTACK_MIGRATOR_DATABASE_URL`, `NODE_ENV`.

`LOBBYSTACK_CERTIFICATION_MODE` must be `false` (or unset) in production; it is only for isolated certification.

Twilio credentials must belong to the account that owns the production numbers, not the staging account. Twilio signs each webhook with the number-owning account's auth token, so a mismatch makes every inbound voice and SMS callback return `403` and callers hear “Application error occurred.” Set `TWILIO_VERIFY_SERVICE_SID` to the production Verify service; a staging Verify service sends onboarding OTPs through the wrong account.

The importer stores legacy accounts with `email_verified = false` unless their source row carried an `emailVerificationTime`. With `REQUIRE_EMAIL_VERIFICATION=true`, Better Auth blocks those accounts from signing in; run migration `0053_legacy_email_verified_backfill.sql` to mark them verified.

## 4. Domains and DNS

Decide names (for example `app.<domain>` for admin, `voice.<domain>` for the gateway, plus any embed/widget host). Pre-lower TTL well before the window, add the Railway domains, verify certificates, and keep the legacy records until the observation window closes. Record the exact DNS records and the reversal steps in the release record.

## 5. Provider endpoint changes

Before switching, update, in order: Twilio SMS and status callbacks, Twilio Voice inbound and stream/status callbacks, the Polar webhook endpoint (production org), the Resend webhook endpoint, and the Google OAuth redirect URI. Each reversal step is documented in [traffic cutover/rollback](./traffic-cutover-rollback.md) and [provider ingress](./provider-ingress-plan.md).

## 6. Maintenance, freeze, and observation

1. Enable replacement maintenance (`LOBBYSTACK_MAINTENANCE_MODE=true`) on admin/worker/voice before cutover; confirm admin returns `503` for non-health API and webhooks and voice rejects non-liveness routes.
2. Freeze legacy writes per the [legacy write-freeze runbook](./legacy-write-freeze.md), record the pause response, and bound the drain/observe window.
3. Apply the reviewed production importer and reconciliation to the isolated or production target as approved; resolve every preflight issue.
4. Start replacement consumers, run the smoke/performance checks, and observe the documented window (error rate, latency, outbox, dead letters, provider callbacks).

## 7. Rollback boundary

Define the no-return point before cutover. Before it, revert DNS and provider endpoints to legacy, reopen legacy writes, and reconcile callbacks; after it, a database/storage restore is an incident decision, not an automatic cutback. Record the rollback authority and decision deadline.

## 8. Go/no-go and authorizations required

The following require explicit human approval and production credentials; they are **not** performed by this plan:

- [ ] Approve production provisioning and its recurring cost.
- [ ] Provide production secrets (database, auth, Twilio, Polar live, Google, SMTP, OpenAI, PostHog, storage).
- [ ] Approve DNS and domain changes.
- [ ] Approve provider endpoint changes.
- [ ] Approve the legacy write freeze window.
- [ ] Approve the traffic switch and the rollback boundary.
- [ ] Push and approve the release candidate commit.

Until these are signed, production remains on the legacy system and the replacement stack stays `releaseCertified: false`.

## 9. Provisioned production standby (2026-09-16)

The owner approved provisioning and rollout. The reversible standby was built; the irreversible cutover steps were **not** performed.

Provisioned in `production` (all healthy):

| Resource | Identity | Domains/notes |
| --- | --- | --- |
| `admin` | service `3fd5070b-8cb2-4df2-a7f2-ee89eb0098fb` | `https://admin-production-8982.up.railway.app` (Railway-generated); `/api/health/ready` 200. |
| `worker` | service `1c873b45-87f0-42aa-a0c8-e00cfb847476` | private; `/health/ready` 200. |
| `voice-gateway` | service `2fe5fc51-8362-4c58-9884-a295fefe8afb` | `https://voice-gateway-production-c1a7.up.railway.app`; `/health/ready` 200. |
| `migrator` | service `f5836a29-b3d9-471c-8ee6-c38006e5bd90` | run-once; migrations + `bootstrap` + RLS verification passed. |
| `Postgres` | service `c4878c02-811f-407d-97f1-44acf4987913` | new `postgres-volume-production`; private `postgres.railway.internal`. |
| `Redis-production` | database `Redis-production` | database-owned `redis-production-volume`; `requirepass`, `appendonly yes`. |
| bucket | `lobbystack-production` (`lobbystack-production-zomrgj`) | isolated from `parity-certification`. |

Configuration notes:

- `.railway/railway.ts` now manages `staging` **and** `production`; Railway owns each managed Redis database's `/data` volume. Production uses `redis-production-volume`, while staging retains `redis-volume` as an adopted IaC resource. Staging values are unchanged.
- A new migrator `bootstrap` command (`packages/db/src/cli.ts`) sets `LOGIN` + password on the migration-created NOLOGIN roles from `LOBBYSTACK_*_PASSWORD`; fresh environments require it before the app roles can connect.
- Production `REDIS_PREFIX` is `lobbystack-prod-20260916`; production `S3_*` come from the `lobbystack-production` bucket credentials.
- Provider endpoints, DNS, `APP_BASE_URL`, `AUTH_TRUSTED_ORIGINS`, `GOOGLE_REDIRECT_URI`, and Twilio callback URLs point at the Railway-generated production domains, **not** at customer-facing domains, and no external provider has been repointed.
- `LOBBYSTACK_MAINTENANCE_MODE` is `false` for the standby because the worker/voice `/health/ready` probes return `503` under maintenance and fail the Railway healthcheck (the documented readiness-vs-intentional-unreadiness conflict). Maintenance must be re-enabled as the first cutover step.
- Production credentials live in the private restricted directory, not in this repository.

Still required before any cutover: a fresh frozen production snapshot (the 2026-09-12 export is not the cutover artifact), the production import + reconciliation, provider-owner approval and endpoint changes, DNS/domain selection, the legacy write freeze, and the traffic-switch/rollback rehearsal.
