# Traffic cutover and rollback runbook

## 1. Purpose and status

This runbook is the reviewable procedure for the `Traffic cutover and return` readiness item in [production readiness](../validation/production-readiness.md) (line 31). It defines the traffic-switch steps, the provider-endpoint moves, the in-flight reconciliation window, and a separately rehearsed traffic rollback.

Status: **BLOCKED**. This document is a plan, not an approval and not a certification. It requires both release-authority and rollback-authority approval; until those approvals and the preconditions in §3 exist, no step here may be executed against production. It sets and preserves `releaseCertified: false`. Completing this runbook's rehearsal does not authorize a production traffic switch.

Sources: [production migration rehearsal](../migrations/production-rehearsal.md) (freeze/provider boundary at lines 63-75, rollback boundary at lines 77-83), [provider event ingress plan](./provider-ingress-plan.md), [legacy write freeze](./legacy-write-freeze.md), [production readiness](../validation/production-readiness.md) (`Traffic switch` line 52, `Traffic rollback` line 53, operations soak line 85), and [certification runbook](../validation/certification-runbook.md) (lines 29-38).

## 2. Roles and approvals

All owners are `UNASSIGNED` until named in the restricted release record. A missing or expired approval blocks the corresponding step. Approvals are recorded outside this repository.

| Role | Owner | Required approval |
| --- | --- | --- |
| Release authority | UNASSIGNED | Approve cutover scope, the traffic-switch procedure, the observation window, and the no-return declaration; own the release record and the go/no-go call. |
| Traffic/DNS owner | UNASSIGNED | Approve and execute DNS/routing records and TTL pre-lowering; approve any staged percentage; retain revert records. |
| Provider coordinator | UNASSIGNED | Approve provider endpoint moves, pause/retry windows, and reversal steps; confirm provider retry schedules. |
| Legacy-system owner | UNASSIGNED | Approve and enforce the legacy write freeze, the canary proof, and any legacy resume. |
| Reconciliation owner | UNASSIGNED | Approve replay/ordering rules, in-flight handling, and the accounting report. |
| Rollback authority | UNASSIGNED | Approve the traffic-rollback plan and decision deadlines; declare the post-no-return incident decision. |
| Independent reviewer | UNASSIGNED | Independently verify this runbook and the rehearsal evidence against the preregistered pass/fail criteria. |

## 3. Preconditions

None may be waived by a passing automated check. Each is currently `BLOCKED` or `NOT-RUN` in [production readiness](../validation/production-readiness.md).

1. Reviewed production importer and source-to-target reconciliation complete and green. Neither exists; the development-only importer and the selected-table reconciliation check do not satisfy this ([production rehearsal](../migrations/production-rehearsal.md):54-61; [certification runbook](../validation/certification-runbook.md):35,37).
2. Isolated target proof: documented isolation from production database, storage, Redis, queues, DNS, and provider credentials, plus a disposal plan ([production rehearsal](../migrations/production-rehearsal.md):24-28).
3. Legacy write freeze tested with a recorded canary write that was rejected and not recorded ([legacy write freeze](./legacy-write-freeze.md):119-130). Replacement maintenance mode does not freeze the legacy system.
4. Provider pause/retry plan approved by every provider owner, with an approved observation window covering at least one full retry cycle per provider ([provider ingress plan](./provider-ingress-plan.md):39-56,92-101).
5. Maintenance behavior reconciled with platform healthchecks. The isolated finding is that the Railway readiness healthcheck cannot pass while the service is intentionally unready, so a `LOBBYSTACK_MAINTENANCE_MODE=true` deploy fails and the previous non-maintenance container keeps serving; the same applies to the worker. Before cutover the platform deployment must reconcile "intentionally unready under maintenance" with readiness-based healthchecks, for example a liveness deploy probe or an explicit stop ([readiness progress](../validation/readiness-progress-2026-09-13.md):103; [production rehearsal](../migrations/production-rehearsal.md):65-73).
6. Release candidate approved: revision frozen, deploy rehearsed, and the operations soak recorded ([production readiness](../validation/production-readiness.md):85).

## 4. Traffic-switch procedure

The switch is a controlled, gated sequence. Every stage is logged and may be stopped by the release authority.

1. **Pre-lower TTL.** At least one full old-TTL period before the window, reduce the affected DNS record TTLs so a revert propagates within the observation window. The traffic/DNS owner records old and new TTLs.
2. **Publish and freeze.** Confirm the maintenance platform reconciliation (§3.5), enter legacy write freeze, and set the approved provider pause/retry window before any replacement maintenance. Do not enter replacement maintenance first ([provider ingress plan](./provider-ingress-plan.md):41-48).
3. **Verify replacement readiness.** With maintenance on, confirm the probe contract: admin exposes only `GET`/`HEAD` health probes, the gateway exposes only `/health` and `/health/live`, and `/health/ready` is intentionally `503` ([production rehearsal](../migrations/production-rehearsal.md):65-70; [production readiness](../validation/production-readiness.md):46-47). Confirm the platform's deploy probe consequence per §3.5.
4. **Point routing.** Move the public hostname(s) and any weighted routing from legacy to the replacement stack. If the routing layer supports weighting, use a staged ramp (`1% → 10% → 50% → 100%`) with a hold at each stage; otherwise the switch is atomic and the observation window must be longer.
5. **Exit maintenance and admit traffic.** Restart workers/consumers and re-point provider endpoints (§5) per the approved ordering. The first accepted provider event or first production write is the no-return candidate (§4.6).
6. **Observe.** Hold traffic and providers for the approved observation window while monitoring health, error, and soak criteria.

**Progression gates (all must hold at each stage before increasing):**

- Admin, worker, and voice readiness are healthy and stable; the worker is consuming.
- Error budget: no unexplained `5xx` or webhook durable-response failures; rejected callbacks are attributable to the approved retry window.
- Operations-soak thresholds: ordinary API p95 below 500 ms excluding providers, realtime p95 below 500 ms, voice-context p95 below 300 ms, webhook durable-response p95 below 1 s, outbox dispatch p95 below 2 s, no unacknowledged critical alert, and no unexplained data-loss or reconciliation signal ([production readiness](../validation/production-readiness.md):85).
- Reconciliation accounting (§6) shows accepted, published, and dead-lettered counts consistent with the provider plan.

Any gate failure triggers the stop rule: stop progression, then execute §7 rollback if the no-return point has not been declared.

**No-return point.** The no-return point is the moment, after the legacy freeze is confirmed and provider endpoints are repointed, when the first production write or provider callback is durably committed to the replacement datastore such that a routing revert alone cannot reconcile diverged state without a restore. The **release authority declares the no-return point, with the rollback authority's concurrence**, and records the UTC timestamp in the release record. Before it, rollback is a routing/provider reversal. After it, recovery requires the §7.2 incident decision.

## 5. Provider endpoint handling

The provider coordinator moves and, on reversal, restores the exact endpoints below. All are public HTTPS endpoints; the exact hostnames are held in the restricted release record, not here. This section references the inbound inventory in [provider ingress plan](./provider-ingress-plan.md) §1-2.

| Provider | Endpoint(s) that move | Direction | Reversal |
| --- | --- | --- | --- |
| Twilio Messaging | `POST /api/webhooks/twilio/sms` (inbound) and `POST /api/webhooks/twilio/status` (status callback), via `TWILIO_SMS_WEBHOOK_URL` and `TWILIO_STATUS_CALLBACK_URL` ([railway](../deployment/railway.md):31-33) | Legacy → replacement | Restore the legacy URLs; confirm Twilio signature validation still reconstructs the legacy public endpoint. |
| Twilio Voice | `POST /twilio/voice/inbound`, `POST /twilio/voice/stream-status`, `POST /twilio/voice/call-status`, `POST /twilio/voice/transfer-action`, and `UPGRADE /media-stream` on the voice gateway | Legacy → replacement | Restore the legacy voice URL; media-stream upgrades are not replayable, so drain active calls first ([provider ingress plan](./provider-ingress-plan.md):55-56). |
| Polar | `POST /api/webhooks/polar` | Legacy → replacement | Restore legacy delivery; replay accepted events from the Polar dashboard ([provider ingress plan](./provider-ingress-plan.md):52). |
| Resend (Svix) | `POST /api/webhooks/resend` | Legacy → replacement | Restore legacy endpoint; trigger replay from the Svix dashboard ([provider ingress plan](./provider-ingress-plan.md):53). |
| Google OAuth | `GOOGLE_REDIRECT_URI` → `/api/calendar/google/callback` (`apps/admin/app/api/calendar/google/callback/route.ts:17-19`; `apps/admin/app/api/calendar/google/start/route.ts:14-16`) | Legacy → replacement | Restore the legacy redirect URI in Google Cloud and in `GOOGLE_REDIRECT_URI`. In-flight authorization codes must be re-issued against the active redirect URI. |

Accepted events remain replay-safe by the keys in §6 only after acceptance; rejected callbacks depend on provider retry or owner-driven replay.

## 6. In-flight and reconciliation window

**Preserved vs lost** (from [provider ingress plan](./provider-ingress-plan.md):60-88):

- Preserved on acceptance: `provider_events` rows for Polar, Resend, and inbound SMS; the matching outbox rows; in-transaction domain state.
- Not preserved: rejected requests (bad signature, malformed, maintenance `503`, unhandled `500`), accepted-but-ignored events with no resolved business, active voice calls and media streams, and in-flight gateway session state.
- Outbox jobs persist in PostgreSQL and resume after worker restart; dispatch is delayed, not lost.

**Replay and idempotency.** Rejected callbacks are recovered only by provider retry or owner replay. Dedupe keys: Polar `(provider='polar', webhook-id)` with outbox `provider-event:<webhook-id>:billing`; Resend `(provider='resend', svix-id)` with outbox `provider-event:<svix-id>:email`; Twilio SMS `(provider='twilio', MessageSid)` with `messages.provider_message_id`; Twilio status by message/notification/operator-delivery ID and the status-transition guard; Twilio voice has no event key and the transfer outbox key embeds `revision`, so treat voice/transfer replays as at-least-once ([provider ingress plan](./provider-ingress-plan.md):67-77). The open `call-status` reason-string mismatch and out-of-order status regression remain unresolved defects that gate this window ([provider ingress plan](./provider-ingress-plan.md):35,64).

**Accounting report required.** The reconciliation owner produces an aggregate-only report from `provider_events` (`status`, `provider`, `created_at`) and `outbox_messages` (`published_at`, `dead_lettered_at`, `attempts`), with per-provider accepted, published, dead-lettered, and unreconciled counts, plus any replay actions and their keys. No payloads, customer data, or private locations are recorded ([provider ingress plan](./provider-ingress-plan.md):77).

## 7. Traffic rollback

A **traffic rollback** restores traffic, routing, and provider endpoints to legacy. It is not a database/storage restore. The recovery runbook restores PostgreSQL and storage state into a selected target; it does not revert DNS or provider routing, reopen legacy writes, reconcile rejected callbacks, or reconstruct in-flight traffic ([production rehearsal](../migrations/production-rehearsal.md):77-79; [certification runbook](../validation/certification-runbook.md):38).

### 7.1 Pre-no-return rollback

Authority: the **rollback authority**, on the release authority's stop call. Deadline: before the no-return declaration, and no later than the end of the approved observation window. Steps:

1. Stop traffic progression and hold or return routing to legacy per the traffic/DNS owner's revert record.
2. Reverse provider endpoints to legacy (§5) and restore the legacy pause/retry posture.
3. Handle sessions and callbacks: drain or fail active voice/media sessions explicitly; confirm which callbacks were accepted into replacement durable state and replay them to legacy per the reconciliation owner's rules.
4. Data authority while systems diverge: the legacy system is authoritative for customer-facing state until reconciliation completes; the replacement datastore is quarantined read-only for forensics. No writes resume against both.
5. Resume the legacy write freeze only after routing and provider endpoints are confirmed on legacy, then record the outcome.
6. Reconcile the window and record the rollback in the release record.

### 7.2 Post-no-return

After the no-return point, a traffic rollback is not an automatic cutback. It requires an incident decision by the **release authority with the rollback authority**, with the legacy-system owner and reconciliation owner concurring, recorded with a UTC timestamp. The decision deadline is the incident-response window defined in the release record. Recovery is the destructive state restore in [backup and restore](../operations/backup-restore.md), followed by re-reconciling the divergence window; it does not by itself restore legacy traffic or provider routing. Do not treat a successful restore as a completed traffic rollback.

## 8. Rehearsal exercise

Execute in the isolated, disposable target from §3.2 with synthetic or non-customer fixtures and no production traffic, provider credentials, or production snapshot ([production rehearsal](../migrations/production-rehearsal.md):57-59). Two parts, both required before either full rehearsal in [production rehearsal](../migrations/production-rehearsal.md):47-61 can pass.

### 8.1 Tabletop

Walk every section of §4-§7 with the assigned owners, using a written inject schedule (for example: probe fails during ramp; Twilio `call-status` arrives pre-initialization; a rejected Polar callback needs replay; a post-no-return defect forces the incident decision). Capture decisions, dissent, and the owner for each action.

Pass criteria: the no-return definition is unambiguous; each role accepts its approval; deadlines are set; every stop rule maps to a named authority.

### 8.2 Dry run

Against the isolated target, execute the switch and the rollback **without production traffic**: pre-lower TTL, enter freeze and maintenance, repoint signed test deliveries and routing to the isolated target, observe the gates, then run the pre-no-return reversal and the post-no-return tabletop decision. Use signed test deliveries only; do not send production provider traffic.

Pass criteria: routing and endpoint reversals restore the isolated legacy path; no rejected callback is unrecoverable within the approved window; accounting counts reconcile; every gate and stop rule fires as designed; the isolation boundary holds throughout.

### 8.3 Required evidence fields

Each run records: run id, UTC start, UTC end, environment identity (opaque), deployed revision, owner, reviewer, step results, observed aggregate metrics, result (`passed`/`failed`/`blocked`), and disposition. Retain detailed evidence in the restricted evidence store. Repository evidence must not contain secrets, customer data, provider payloads, or private filesystem paths ([production readiness](../validation/production-readiness.md):14-16).

## 9. Authorization

No production traffic switch is authorized by this document. It is a procedure pending approval; it becomes an authorization only when the release authority and rollback authority approve it in the release record and every precondition in §3 and the rehearsal in §8 are satisfied. Until then, production traffic remains on legacy and `releaseCertified` remains `false`.
