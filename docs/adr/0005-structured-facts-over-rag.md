# ADR 0005: keep structured facts authoritative

LobbyStack stores operational facts in structured records and uses retrieval for supporting business knowledge.

## Status

Accepted

## Decision

Hours, services, closures, transfer policies, and booking rules live in structured tables. Retrieval-augmented generation (RAG) augments only unstructured knowledge.

## Rationale

Operational facts need deterministic answers and must not depend on retrieval quality.
