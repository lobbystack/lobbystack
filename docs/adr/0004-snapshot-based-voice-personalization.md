# ADR 0004: Use Snapshot-Based Voice Personalization

## Status

Accepted

## Decision

Compile business personalization into a call-start snapshot fetched once by the voice gateway.

## Rationale

This avoids per-turn backend round trips during calls while preserving a single source of truth in Convex.
