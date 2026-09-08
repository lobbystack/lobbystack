# ADR 0007: use PostgreSQL as the main backend

PostgreSQL stores durable state while shared domain modules coordinate work across the admin and worker runtimes.

## Status

Accepted

## Decision

PostgreSQL owns persistent state. `packages/domain` owns durable business logic, `apps/admin` exposes authenticated HTTP operations, and `apps/worker` executes asynchronous workflows through Redis queues and a transactional outbox.

The voice gateway remains a narrow realtime runtime and calls the admin backend for authoritative operations.

## Rationale

PostgreSQL provides explicit schema migrations, role-specific connections, row-level security, portable self-hosting, and transactional coordination between business state and asynchronous side effects. Keeping business logic in shared domain modules prevents the admin, worker, and voice runtimes from diverging.

## Migration

Convex export/import, reconciliation, lineage columns, and rollback documentation remain until production cutover and the rollback window are complete. They are migration tooling, not active runtime dependencies.
