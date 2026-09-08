# ADR 0006: use an internal telemetry abstraction

Typed internal events keep provider code out of product and domain modules.

## Status

Accepted

## Decision

Feature code emits internal typed events and never calls vendor telemetry SDKs directly.

## Rationale

This keeps telemetry mode-aware, redacted, swappable, and non-blocking.
