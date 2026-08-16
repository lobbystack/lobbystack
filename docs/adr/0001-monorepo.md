# ADR 0001: Use A pnpm Monorepo

## Status

Accepted

## Decision

Use one pnpm monorepo with application runtimes, shared packages, database migrations, and operational tooling.

## Rationale

This keeps cloud and self-hosted variants on one codebase and makes shared contracts explicit across web, backend, and voice runtimes.
