# ADR 0002: Convex Is The Main Backend

## Status

Accepted

## Decision

Convex owns persistent state, business logic, booking, async workflows, and most provider orchestration.

## Rationale

The voice gateway should not grow into a second backend. Keeping business state in Convex preserves consistency across SMS, dashboard, and voice flows.
