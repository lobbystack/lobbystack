# Readiness implementation — 2026-09-12

**Release decision: not certified.** This records working-tree implementation and local verification, not completion of the production-readiness plan. No production import, staging reset, deployment, provider destination change, or traffic cutover was performed.

## Implemented

- `pnpm release:check`: local lint/typecheck/test/build baseline; optional selected fixture E2E profile; guarded disposable staging checks; explicit Resend scope; zero skipped/flaky/failed attempts in the selected Playwright JSON report. Evidence includes run/revision, dirty state, timings, output digests, all gate states, and outstanding release gates. Evidence cannot certify a release automatically.
- `pnpm migration:preflight`: audit-only archive/manifest/unpacked inventory verification, source-table disposition checks, identity/reference checks, reserved snapshot metadata handling, and mandatory object size/SHA-256 validation. Restricted reports refuse overwrite. It cannot import data or establish provenance from a checksum alone.
- Replacement maintenance isolation through `LOBBYSTACK_MAINTENANCE_MODE=true`: admin API/webhook and voice-operation rejection before processing, gateway HTTP/WebSocket admission rejection, and worker startup without consumers/schedulers/provider startup. The signed voice readiness handler remains responsible for authenticated maintenance responses. This is not a live drain switch, legacy freeze, or durable webhook buffer.
- Signed admin `/voice/ready` checks database/storage readiness. Gateway readiness requires the exact success marker with a bounded probe; liveness remains independent. Deploy the admin endpoint before deploying the updated gateway. Maintenance leaves worker/gateway unready by design; stop/drain old instances before a maintenance deployment rather than assuming an unready rolling replacement has displaced them.
- Admin Docker healthcheck uses readiness. Standalone tracing includes SWC ESM helpers that were missing from a successful Next.js build.
- Playwright honors explicit role URLs and supplies random disposable test-server secrets. Auth callback browser regression asserts the real sanitized redirect rather than mocked text that never rendered.
- CI uses a frozen lockfile and retains baseline/staging evidence. Existing full E2E execution remains separate from the optional selected fixture profile.

## Verification

Local baseline command:

```sh
pnpm release:check --local --evidence .tmp/readiness-baseline-20260912.json
```

| Field | Value |
| --- | --- |
| Run ID | `56652046-d372-4d9b-88df-cc1f449fa9c5` |
| Base commit | `141f174c6ab2835dece58790759c072f26c1f2c0` |
| Working tree | Modified (`dirtyGit: true`); this is not evidence for a committed/deployed release |
| UTC start / finish | `2026-09-12T17:40:15.530Z` / `2026-09-12T17:41:42.619Z` |
| Lint | Passed, with 20 existing admin warnings |
| Typecheck | Passed across workspaces and scripts |
| Tests | Passed across workspaces and scripts; admin 466, voice 168, worker 31, script tests 33 |
| Build | Passed across workspaces, including standalone admin and widget loader |
| Runtime | Local Node 26.8.1; release CI/deployment Node 22 verification remains required |

Browser verification used the production standalone build, generated test secrets, and explicitly unreachable localhost database URLs so it could not write customer state:

- `apps/admin/e2e/auth-pages.e2e.ts`: 3 passed.
- Verification callback case repeated three times: 3 passed.
- This does **not** certify real login/signup/recovery persistence, authenticated operator fixtures, widget/provider flows, or migrated credentials.

The first browser launch exposed missing SWC ESM files; fixed tracing and rebuilt. A subsequent launch exposed missing isolated test secrets; fixed the Playwright environment. The callback assertion initially failed because Better Auth performed the real local redirect; the test now checks that redirect and rejects any cross-origin main-frame navigation.

After the baseline, the admin maintenance gate was extended to reject GET voice operations as well as API requests. Focused proxy tests (5) and script typecheck passed. Structural `replacement:drift`, `replacement:parity`, and `replacement:admin-ui-parity` checks also passed; those checks do not replace rendered visual evidence.

## Snapshot and infrastructure discovery

The operator requested acquisition through Convex. A pinned isolated CLI exported the production snapshot with file storage into restricted temporary storage outside the repository and synced notes. Archive metadata, file inventory, draft dispositions, and source-audit reports remain private. The stale deploy key failed; existing CLI OAuth completed the export without deploying code or changing source records.

This is a live-source rehearsal snapshot, **not a final write-frozen cutover export**. File permissions are restricted; `fdesetup status` confirmed FileVault is on. This does not provide a separately encrypted portable backup, and approved retention/disposal remain open. Source storage hashes/sizes passed the read-only audit, but the draft manifest is not approved, the target is unprovisioned, and a draft exclusion conflicts with an imported reference. No target reconciliation has run.

Read-only Railway discovery confirmed an existing populated staging environment and an empty production environment in the linked replacement project. Existing staging was not treated as disposable or reset. Current working-tree changes are not deployed there.

## Remaining blockers

1. Complete production-safe importer, authoritative source mappings, strict storage transfer, derived-data rebuild, and full source-to-target reconciliation. The development-only importer remains unchanged and must not be used on this production snapshot.
2. Review draft source dispositions and snapshot handling; provision a separately identified isolated rehearsal target with outbound effects disabled.
3. Implement/test legacy write freeze, call/job drain, provider-specific durable ingress/retry handling, and replay accounting.
4. Perform **two full clean-target rehearsals using the same immutable snapshot**, including import, rebuild, reconciliation, required journeys, recovery, and traffic-switch rollback.
5. Complete full authenticated/browser/provider/visual coverage, RLS certification against the test database, security scans, performance soak, alert drills, and Railway database-plus-bucket restore.
6. Name operator/reviewer, agree RPO/RTO and the no-simple-rollback boundary (including webhook replay), and obtain production go/no-go approval.

Follow [production readiness](./production-readiness.md) and [production rehearsal](../migrations/production-rehearsal.md). Keep `releaseCertified: false` until these gates have actual evidence.
