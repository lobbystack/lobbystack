# ADR 0001: use a pnpm monorepo

LobbyStack keeps application runtimes, shared packages, database migrations, and operational tooling in one repository.

## Status

Accepted

## Decision

Use one pnpm monorepo with application runtimes, shared packages, database migrations, and operational tooling.

## Rationale

This keeps cloud and self-hosted variants on one codebase and makes shared contracts explicit across web, backend, and voice runtimes.
