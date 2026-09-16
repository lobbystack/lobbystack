# Production migration rehearsal

## Current boundary

There is no production importer. A partial, curated development-only importer exists; it rejects any source deployment other than its compiled approved development identifier and production-looking export paths. It is not a source-to-target reconciliation implementation. Do not weaken, bypass, replace, or document a workaround for those guards to use a production snapshot.

`pnpm migration:preflight` is the installed package entry point for the production snapshot audit. It is an audit-only command: `--apply` is rejected, its output reports `productionCertified: false`, and an archive digest does not prove that the supplied unpacked export originated from that archive. A passing preflight is a prerequisite intake control, not an import, source-to-target reconciliation, traffic cutover, or approval.

See [production readiness](../validation/production-readiness.md) for the executable matrix and rehearsal record, the [current implementation validation report](../validation/readiness-implementation-2026-09-12.md) for implementation scope, and [backup and restore](../operations/backup-restore.md) for state recovery procedures.

## Required approvals

Before either production-snapshot rehearsal, obtain and record outside this repository:

1. A change authority approving the rehearsal scope, source snapshot, target identity, and stop conditions.
2. A snapshot custodian approving acquisition, restricted handling, and destruction of working copies.
3. A target-environment owner approving isolation and disposal.
4. Provider owners approving pauses, retry windows, endpoint changes, and reconciliation responsibilities.
5. A legacy-system owner approving a tested write freeze.
6. A rollback authority approving the traffic return boundary and the decision deadline.

All owners are `UNASSIGNED` until named in the release record. Missing approval blocks the rehearsal.

## Snapshot isolation

Use a disposable target that is isolated from production PostgreSQL, object storage, Redis, queues, DNS, and provider credentials. It must not share writable credentials, endpoints, buckets, or callback URLs with production.

The snapshot audit requires a reviewed manifest that declares source tables and their `import` or `exclude` disposition, reviewed target identity, archive and manifest SHA-256 values, and an inventory of unpacked files. Store detailed reports in restricted evidence only. Repository evidence may identify the run and report pass/fail, issue codes, table names, and aggregate counts; it must not include snapshot records, customer data, secrets, or storage locations.

Run the audit as follows:

```sh
pnpm migration:preflight -- \
  --export=<unpacked-export> \
  --archive=<archive> \
  --expected-archive-sha256=<sha256> \
  --manifest=<reviewed-manifest> \
  --expected-manifest-sha256=<sha256> \
  --run-id=<run-id> \
  --source-deployment=<approved-source> \
  --target-environment=<isolated-environment> \
  --target-environment-identity=<identity>
```

Do not add `--apply`; it is deliberately unsupported.

## Rehearsal standard

Two full rehearsals are required. They must use the same immutable approved snapshot, identified by the reviewed archive and manifest digests, and separate clean disposable targets. Preflight must pass before each rehearsal, but is not itself either rehearsal.

Each rehearsal must perform, in order:

1. Preflight against the immutable snapshot.
2. Full import into a clean target using a reviewed production importer.
3. Rebuild of all approved derived data, indexes, and asynchronous state.
4. The approved target-reconciliation procedure.
5. The complete customer-journey matrix and 30-minute operations soak in [production readiness](../validation/production-readiness.md).
6. A traffic-switch and traffic-rollback exercise without production traffic.
7. Target disposal and restricted evidence retention.

This standard is currently `BLOCKED`. A production importer and a source-to-target reconciliation implementation do not exist. The partial development importer and the current selected-table reconciliation check cannot satisfy steps 2 or 4.

## Freeze and provider boundary

Replacement maintenance mode is a containment mechanism, not a cutover solution. The shared `LOBBYSTACK_MAINTENANCE_MODE` Compose environment is wired into replacement admin, worker, and voice-gateway services.

- With `LOBBYSTACK_MAINTENANCE_MODE=true` at worker startup, replacement workers do not start consumers, schedulers, or provider clients; the worker remains live but unready. Existing workers must be restarted for this to take effect.
- In the admin application, all `/api/*` requests except `GET` and `HEAD` health probes are rejected with `503`. Webhooks are rejected before validation, acknowledgment, or enqueueing.
- In the voice gateway, every non-liveness HTTP route is rejected with `503` and media-stream upgrades close with `503`. Only `/health` and `/health/live` remain available; `/health/ready` is rejected during maintenance.
- Outside maintenance, gateway readiness is a signed, empty-body `GET` to `/voice/ready`. The gateway accepts readiness only when the backend returns the exact marker `{ "ok": true, "service": "lobbystack-voice", "readiness": "ready" }`.
- It does not freeze writes in the legacy system.
- It does not provide a durable buffer for inbound provider events. Rejected webhooks rely on each provider's retry behavior, which must be explicitly approved and reconciled.
- It does not preserve or replay in-flight calls, messages, jobs, or provider callbacks.

The cutover plan must therefore separately define: the legacy write freeze, provider pause or retry window, handling for in-flight work, endpoint/DNS routing, the observation window, and a reconciliation owner. Do not enter maintenance until those controls and their return plan are approved.

## Rollback boundary

The recovery runbook restores PostgreSQL and storage state into a selected target. It is destructive and useful for state recovery, but it is not a traffic rollback. It does not revert DNS or provider routing, reopen legacy writes, reconcile callbacks rejected during maintenance, or reconstruct in-flight traffic.

Define a traffic rollback before cutover with a clear no-return point. Before that point, identify the authority that can return routing to legacy, the provider endpoint reversal steps, session and callback handling, the event reconciliation window, and the data authority while the systems diverge. After that point, a restore requires an incident decision; it is not an automatic cutback.

No production traffic switch is authorized by this document. It remains blocked until a reviewed production importer, source-to-target reconciliation implementation, provider plan, legacy freeze, and two repeatable full traffic-rollback rehearsals exist.
