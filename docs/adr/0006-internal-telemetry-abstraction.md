# ADR 0006: Use An Internal Telemetry Abstraction

## Status

Accepted

## Decision

Feature code emits internal typed events and never calls vendor telemetry SDKs directly.

## Rationale

This keeps telemetry mode-aware, redacted, swappable, and non-blocking.
