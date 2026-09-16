# Production rollout plan

**Status:** preparation only. **No production rollout is authorized by this document.** Production is currently unprovisioned (the Railway `production` environment `17162691-75e0-494a-8318-0233cbecf2e0` has no services, no application variables, and no deployments). Creating paid production resources, loading production secrets, changing DNS or provider endpoints, freezing the legacy system, and switching traffic are irreversible or externally visible and require an explicit go/no-go.

Use with [production readiness](../validation/production-readiness.md), the [certification runbook](../validation/certification-runbook.md), the [production migration rehearsal](../migrations/production-rehearsal.md), the [traffic cutover/rollback runbook](./traffic-cutover-rollback.md), the [provider ingress plan](./provider-ingress-plan.md), the [legacy write-freeze runbook](./legacy-write-freeze.md), and the [isolated target evidence](./isolated-rehearsal-target.md).

## 1. Entry criteria

| Criterion | State |
| --- | --- |
| Immutable release candidate | Local commit `bccdb4af25511c1c2e487f344880deb89cfa2183`; clean baseline `3d03ad41-8170-45f1-acc0-9336e9495b03` passed. Not pushed. |
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

Create in the `production` environment (same project `lobbystack-parity-20260907`, region `us-east4-eqdc4a` unless changed):

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
