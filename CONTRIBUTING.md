# Contributing

## Expectations

- Keep Convex as the main backend and source of truth.
- Keep the voice gateway narrow. Do not move tenant state, booking state, or business rules into it.
- Prefer shared abstractions in `packages/` over ad hoc SDK calls in feature code.
- Add docs alongside major architectural changes.

## Workflow

1. Open an issue or draft a proposal for architecture-affecting changes.
2. Add or update tests for critical paths.
3. Update docs and ADRs when changing major decisions.
4. Keep changes focused and reviewable.

## Development

- Use `pnpm`.
- Prefer mock providers for routine development.
- Use `pnpm typecheck`, `pnpm lint`, and `pnpm test` before opening a PR.

## Code Style

- TypeScript everywhere.
- Strict typing at boundaries.
- TSDoc/JSDoc for important exported modules and non-obvious invariants.
- Avoid leaking provider SDKs into domain code.
