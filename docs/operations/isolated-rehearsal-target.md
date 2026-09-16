# Isolated rehearsal target and disposal

**Status:** written isolation evidence for the disposable rehearsal targets. Owners are `UNASSIGNED`. This is not a production certification and does not authorize a cutover; `releaseCertified` remains `false`.

Use with [production readiness](../validation/production-readiness.md), [production migration rehearsal](../migrations/production-rehearsal.md), and the [readiness progress record](../validation/readiness-progress-2026-09-13.md).

## Targets used

### Local disposable target (migration rehearsals, reconciliation, soak, privacy)

| Resource | Identity | Notes |
| --- | --- | --- |
| PostgreSQL | Docker container `migration-rehearsal-20260912-postgres`, bound `127.0.0.1:15439`, label `lobbystack.purpose=migration-rehearsal` | Databases: `migration_rehearsal_one/two/three/four/five/derived/restore`, `parity_cert_release_20260912` |
| Redis | Docker container `release-e2e-20260912-redis`, bound `127.0.0.1:16389` | Dedicated password; prefix `functional-e2e` |
| Object storage | Local filesystem under the restricted temp root; a throwaway local MinIO container for the privacy check | MinIO removed after the check |
| Fixture admin | Standalone `apps/admin` server on `127.0.0.1:13920` against `parity_cert_release_20260912` | Stopped after the soak |

### Isolated cloud rehearsal environment (Railway)

Railway project `af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6`, environment `migration-rehearsal-20260912` (`dabd34b8-b83e-4d14-ba98-7ebeb19e5ee6`), separate from staging `22237215-5837-4754-842b-9306d43588ed`. Services: `rehearsal-admin`, `rehearsal-worker`, `rehearsal-voice`, `rehearsal-migrator`, `rehearsal-postgres`, `rehearsal-redis`, plus a private bucket. All are separate services/volumes from staging and production.

## Isolation statement

Verified in the current session:

- **Database:** every rehearsal write used `127.0.0.1:15439` (local disposable container) or the rehearsal environment's own private PostgreSQL domain. No production database URL was used.
- **Storage:** object verification used the local filesystem; the privacy check used a throwaway local MinIO bucket that was removed afterwards.
- **Queues/Redis:** the soak and worker drills used the local Redis on `127.0.0.1:16389`; the cloud rehearsal environment has its own Redis service.
- **DNS/webhooks:** the local admin base URL is loopback; the cloud rehearsal admin/voice hosts are Railway-assigned rehearsal domains, not production. No production webhook destination or DNS record was changed.
- **Provider credentials:** the local importer, reconciler, derived rebuild, soak, and privacy check run provider-free. The cloud rehearsal environment does hold real provider credentials, bounded by certification mode (email/SMS recipients and calendars allowlisted, live Polar endpoints rejected); it is isolated by endpoint and data target, not by absence of provider credentials.
- **Legacy system:** the only legacy action was a recorded pause/resume rehearsal against the **development** Convex deployment `dev:valiant-ibis-521`; production was never touched.

## What is not isolated

- The cloud rehearsal environment is not credential-isolated; it authenticates to real providers under certification guards.
- Local Docker containers share the host network namespace for published ports; access is restricted to loopback.

## Disposal plan

1. After certification, stop and remove the local containers (`migration-rehearsal-20260912-postgres`, `release-e2e-20260912-redis`, any MinIO container) and delete the rehearsal databases, volumes, and local artifact directory.
2. Delete the Railway rehearsal environment and its services, volumes, and bucket once the retention window closes.
3. Retain restricted evidence (aggregate reports, hashes, run ids) only; do not retain customer data, secrets, or snapshot contents in the repository.
4. Disposal requires the target-environment owner and snapshot custodian decisions; both are `UNASSIGNED`. Temporary cloud resources incur usage charges until removed.
