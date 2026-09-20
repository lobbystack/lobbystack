# Run the operations soak certification tooling

This document describes tooling. It is not a completed certification, and no run of
it can satisfy the operations-soak exit gate on its own. Every artifact it produces
sets `releaseCertified: false`, and every evidence record keeps `owner` and `reviewer`
as `UNASSIGNED` until an accountable person accepts it in the release record.

The threshold and exit-gate definitions live in
[production readiness](../validation/production-readiness.md) (Operations soak) and
[alerts](alerts.md). This runbook only explains how to operate the two scripts.

## Required approvals before running

Record these outside the repository, then attach the evidence artifacts to the
release record:

- Isolated target owner approval for a non-production, non-local environment.
- Provider owner approval that no production provider credentials or traffic are used.
- Data owner approval that the target holds only synthetic or disposable data.
- Release manager acknowledgement that a passing tool run is not a certification.
- Named owner and reviewer (both currently `UNASSIGNED`).

## Soak certification

`scripts/performance/soak-certification.ts` validates configuration, runs the
existing HTTP soak engine (`scripts/performance/run.ts`), runs the health checks from
`scripts/replacement-performance-check.ts` (same thresholds), and writes one evidence
JSON. It refuses localhost and any URL or hostname containing a production marker,
requires a soak of at least 1800 seconds, and fails closed.

Required environment:

| Variable | Purpose |
| --- | --- |
| `ADMIN_BASE_URL` | Non-local admin origin for health checks. |
| `WORKER_BASE_URL` | Non-local worker origin for health checks. |
| `VOICE_BASE_URL` | Non-local voice-gateway origin for health checks. |
| `PERFORMANCE_SESSION_COOKIE` | Authenticated operator session; never logged. |
| `PERFORMANCE_DEPLOYMENT_ID` | Deployed revision identity for the run. |
| `PERFORMANCE_SOAK_SECONDS` | Integer minimum of `1800`. |

The `--config` file is the normal `scripts/performance/run.ts` config
(see `scripts/performance/http.example.json`). Scenarios may add `category`
(`ordinary-api`, `realtime`, `voice-context`, `webhook-durable-response`,
`outbox-dispatch`) and an optional `targetMs`; the category maps to the
production-readiness threshold. At least one scenario must reference a cookie
environment variable so the soak is authenticated.

```bash
PERFORMANCE_SESSION_COOKIE=... PERFORMANCE_DEPLOYMENT_ID=... PERFORMANCE_SOAK_SECONDS=1800 \
ADMIN_BASE_URL=https://admin.certification.example \
WORKER_BASE_URL=https://worker.certification.example \
VOICE_BASE_URL=https://voice.certification.example \
pnpm exec tsx --tsconfig tsconfig.base.json scripts/performance/soak-certification.ts \
  --config ./soak-config.json --output /tmp/soak-output --evidence /restricted/soak-evidence.json
```

The evidence file is created with mode `0600` and the exclusive `wx` flag; a second
run cannot overwrite it. The single artifact records `status`
(`passed`/`failed`/`blocked`), the per-target p50/p95/p99 for both soak scenarios and
health endpoints, and the threshold misses. A run where `status` is not `passed`
exits non-zero.

## Alert-firing smoke

`scripts/operations/alert-firing-smoke.ts` drives the three critical conditions in
[alerts](alerts.md). Default mode is `--dry-run`: it prints the exact operator steps,
required external configuration, and heartbeat absence guidance, and performs no
writes. It never calls providers, interrupts services, or deletes data; where a
condition needs a deliberate fault it prints the operator command for a human.

Executing requires all of the following. Without them the evidence is `incomplete`
and the process exits non-zero:

- `ALLOW_ALERT_SMOKE=true`
- `--environment=<isolated target name>` that does not contain a production marker
- `--confirmed-firing=<condition>` and `--confirmed-recovery=<condition>` flags for
  each condition the operator observed

```bash
# Dry run (safe; no writes)
pnpm exec tsx --tsconfig tsconfig.base.json scripts/operations/alert-firing-smoke.ts

# Execute against an isolated target and record confirmations
ALLOW_ALERT_SMOKE=true \
pnpm exec tsx --tsconfig tsconfig.base.json scripts/operations/alert-firing-smoke.ts \
  --execute --environment=isolated-soak-1 --evidence /restricted/alert-smoke.json \
  --confirmed-firing=ReplacementOutboxDeadLettered,ReplacementWorkerJobFailures,ReplacementOutboxDispatcherUnavailable \
  --confirmed-recovery=ReplacementOutboxDeadLettered,ReplacementWorkerJobFailures,ReplacementOutboxDispatcherUnavailable
```

Heartbeat and liveness absence checks (`ops.voice.heartbeat`,
`ops.service.health_check`) belong in Product Analytics absence alerts, because Error
Tracking cannot notify on an event that never arrived. See
[provider-failure error tracking](../telemetry/provider-failure-error-tracking.md).

## Interpreting evidence

Both scripts emit JSON with `schemaVersion`, `kind`, `runId`, `generatedAt`, a
`status`, and the frozen `releaseCertified: false`, `owner: "UNASSIGNED"`,
`reviewer: "UNASSIGNED"` fields. Treat any `passed` result as a tooling observation
about one isolated target and one window only. Do not copy payloads, cookies,
connection strings, or any customer data into the evidence file or an incident system.
