# ADR 0002: keep business state behind the application backend

PostgreSQL and shared domain operations form the authoritative backend for every application runtime.

## Status

Amended by ADR 0007

## Decision

PostgreSQL stores durable business state. The Next.js admin API and background worker access that state through role-specific database clients and shared operations in `packages/domain`.

## Rationale

The voice gateway remains a narrow live-call runtime. It loads a business snapshot at call start and uses signed admin-backend requests for bookings, messages, call state, and other authoritative operations.

Convex is limited to import, reconciliation, cutover, rollback, and historical documentation.
