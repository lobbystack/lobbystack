# Legacy write freeze runbook

This runbook operates the legacy Convex write freeze for the LobbyStack migration. The freeze is the native Convex deployment pause control. It is a candidate control, not an approved cutover mechanism, and it is independent of replacement maintenance mode.

Use it with [production migration rehearsal](../migrations/production-rehearsal.md), [production readiness](../validation/production-readiness.md), and the [2026-09-13 progress record](../validation/readiness-progress-2026-09-13.md).

## What pause proves and what it does not prove

Pause proves only that the Convex control endpoint accepted a request to reject new deployment calls, and that the same endpoint later accepted a resume request. The rehearsal record on `2026-09-13` showed pause returning `200`, a full `convex export` succeeding while paused, and unpause returning `200`.

Pause does **not** prove or provide any of the following. Do not describe it as if it does.

- No drain: pause is a "reject new calls" switch, not a documented quiesce barrier. It does not prove that in-flight calls, mutations, jobs, or provider callbacks have completed or stopped.
- No durable provider buffer: inbound provider webhooks are not buffered or replayed. Rejected webhooks rely on each provider's retry behavior, which must be approved and reconciled by the responsible provider owners.
- No export consistency guarantee: the fact that an export succeeds while paused does not establish a consistent cut point for in-flight work.
- No release certification: the tool always records `releaseCertified: false`.

## Required approvals

Nothing here is authorized until the following approvals are recorded outside this repository. Replacement maintenance mode does not substitute for any of them. All owners are `UNASSIGNED` until named in the release record.

| Approval | Owner | Status |
| --- | --- | --- |
| Change authority approving freeze scope, deployment, and stop conditions | UNASSIGNED | BLOCKED |
| Legacy-system owner approving and enforcing the write freeze | UNASSIGNED | BLOCKED |
| Provider owners approving pause, retry/replay, and reconciliation | UNASSIGNED | BLOCKED |
| Rollback authority approving the resume and traffic-return boundary | UNASSIGNED | BLOCKED |

Production pause additionally requires `PRODUCTION_LEGACY_FREEZE_APPROVED=true`. The approval flag alone is not sufficient; the flag and `--allow-production` must both be set. Development deployments never require the production gate.

## Prerequisites

- `CONVEX_ACCESS_TOKEN` is set in the process environment. The tool reads the token only from this variable and never reads personal Convex configuration files.
- `--deployment=<scope:name>` names a valid Convex deployment id. Development (`dev:`) deployments are the default allowlist. Production (`prod:`) deployments are refused unless `--allow-production` and `PRODUCTION_LEGACY_FREEZE_APPROVED=true` are both set. Other scopes are refused.
- `--evidence=<path>` is required for `pause`, `resume`, `verify`, and executed `rehearse`. The tool writes the evidence file with mode `0600` and flag `wx`, so the path must not already exist.

Run the tool from the repository root:

```sh
pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts <action> [flags]
```

## Exact commands

### Status (read-only, default)

`status` never mutates the deployment and performs no control request. It is safe to run at any time.

```sh
pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts status
pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts status --deployment=dev:valiant-ibis-521 --evidence=<restricted-evidence-path>
```

### Pause

Pause requires `--execute` and an allowlisted deployment. Run it only after the required approvals exist and while the provider plan is in force.

```sh
CONVEX_ACCESS_TOKEN=<token> \
  pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts pause \
  --execute \
  --deployment=dev:valiant-ibis-521 \
  --evidence=<restricted-evidence-path>
```

A production pause additionally requires both gates:

```sh
CONVEX_ACCESS_TOKEN=<token> PRODUCTION_LEGACY_FREEZE_APPROVED=true \
  pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts pause \
  --execute \
  --allow-production \
  --deployment=prod:determined-reindeer-80 \
  --evidence=<restricted-evidence-path>
```

### Verify

`verify` is read-only with respect to the deployment. It attempts a best-effort pause signal against the deployment control endpoint and records a canary-write expectation. It does not perform a canary write and it does not prove that in-flight work has drained. A `signal: "unknown"` result is expected when the control endpoint does not expose a readable pause status; record it as inconclusive rather than as proof.

```sh
CONVEX_ACCESS_TOKEN=<token> \
  pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts verify \
  --deployment=dev:valiant-ibis-521 \
  --evidence=<restricted-evidence-path>
```

### Rehearse

`rehearse` performs pause then verify then resume. It always attempts resume, including when verify or pause fails. The default is a dry run that prints the planned steps and does not contact the deployment or require a token.

```sh
pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts rehearse \
  --deployment=dev:valiant-ibis-521
```

Execute the rehearsal only on an allowlisted deployment:

```sh
CONVEX_ACCESS_TOKEN=<token> \
  pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts rehearse \
  --execute \
  --deployment=dev:valiant-ibis-521 \
  --evidence=<restricted-evidence-path>
```

### Resume

Resume requires `--execute`. Run it as soon as the freeze objective is met or the rehearsal ends. Confirm the returned status is `200` and that the evidence records `resumed: true`.

```sh
CONVEX_ACCESS_TOKEN=<token> \
  pnpm exec tsx --tsconfig tsconfig.base.json scripts/migration/legacy-freeze.ts resume \
  --execute \
  --deployment=dev:valiant-ibis-521 \
  --evidence=<restricted-evidence-path>
```

## Canary verification expectations

The write freeze is only credible if a write is observed to fail while the deployment is paused. The tool records the expectation but deliberately does not perform the canary write, because a canary write to a legacy system must be an approved, attributable action.

While paused, the reviewer must run an approved canary write against the legacy system and record:

- The canary identity and the exact write attempted.
- The failure observed (for example an explicit rejection), not only an absent success.
- The timestamp, environment identity, and the operator who ran it.
- Confirmation that the legacy system did not record the write.

The evidence JSON records `canary.writeShouldBe: "rejected"`, `canary.attempted`, and `canary.observed`. Set these to the observed outcome in the release record; do not leave `observed` as `not-attempted` and claim the freeze is verified.

## Resume procedure

1. Confirm the freeze objective is complete or that stop conditions triggered.
2. Run the `resume` command above with `--execute`.
3. Confirm the control endpoint returned `200` and evidence shows `resumed: true`.
4. Perform a read-only legacy read to confirm the deployment is serving again.
5. Reconcile any events that providers retried or rejected during the pause window with the provider owners.
6. Record the resume in the release record. If resume does not confirm, treat it as an incident: do not assume service is restored.

## Relationship to replacement maintenance mode

Replacement maintenance mode (`LOBBYSTACK_MAINTENANCE_MODE=true`) is a separate containment control for the replacement stack. It stops replacement workers, rejects replacement admin API writes, and restricts the replacement voice gateway to liveness routes. It does not freeze writes in the legacy system and it does not buffer inbound provider events. Enabling or disabling replacement maintenance mode has no effect on the legacy freeze, and neither control substitutes for the other. See the freeze and provider boundary in [production migration rehearsal](../migrations/production-rehearsal.md).

## Evidence handling

Evidence JSON includes the deployment, action, UTC start and finish times, steps, `paused`/`resumed` booleans, the canary result, `releaseCertified: false`, and `owner`/`reviewer` as `UNASSIGNED`. All printed and persisted output is passed through redaction: tokens, authorization values, access keys, and URLs are removed before output. The tool reads no personal files and never logs the access token.

Store evidence in the approved restricted evidence store. Do not copy the access token, control URLs, or raw provider payloads into repository files or public reports.
