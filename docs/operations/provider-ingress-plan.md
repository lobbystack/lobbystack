# Provider event ingress, retry, and reconciliation plan

This document satisfies the `Provider event plan` deliverable in [production readiness](../validation/production-readiness.md) (line 28) and the provider boundary in [production rehearsal](../migrations/production-rehearsal.md) (lines 72-75). It is a plan, not a certification. It requires explicit approval from each responsible provider owner before any production rehearsal or cutover. Until then `releaseCertified` remains `false` and the readiness item stays `BLOCKED`.

There is no durable inbound provider-event buffer. Every handler below persists durable records only after signature validation and business resolution; a rejected request leaves no record and depends on the provider retrying. See [production rehearsal](../migrations/production-rehearsal.md) lines 72-73.

## 1. Inbound callback inventory

Response status is the status returned to the provider.

| Route | Provider | Signature verification | Idempotency / dedupe store | Enqueues | Response on failure |
| --- | --- | --- | --- | --- | --- |
| `POST /api/webhooks/polar` | Polar | Standard Webhooks HMAC, legacy + base64 keys (`apps/admin/app/api/webhooks/polar/route.ts:13`; `packages/providers/src/polar/webhook.ts:9`) | `provider_events` unique `(provider, provider_event_id)` with `onConflictDoNothing` (`route.ts:44`; `packages/db/src/schema/index.ts:1151`); outbox `dedupe_key` `provider-event:<webhook-id>:billing` (`route.ts:46`) | `billing.reconcile` outbox | `401` bad signature (`route.ts:30`), `400` malformed (`route.ts:34`), `500` unhandled (`route.ts:55`) |
| `POST /api/webhooks/resend` | Resend (Svix) | Svix HMAC-SHA256 with 5-minute timestamp tolerance (`route.ts:18-22`; `packages/providers/src/email/webhook.ts:5-18`) | `provider_events` unique `(provider='resend', provider_event_id=svix-id)` (`route.ts:30`; schema `index.ts:1151`); outbox `dedupe_key` `provider-event:<svix-id>:email` (`route.ts:31`) | `email.reconcileDelivery` outbox | `503` unconfigured (`route.ts:19`), `401` bad signature (`route.ts:22`), `400` malformed (`route.ts:24`), `500` unhandled (`route.ts:37`) |
| `POST /api/webhooks/twilio/sms` | Twilio Messaging | HMAC-SHA1 over sorted params (`route.ts:21`; `packages/shared/src/twilioSecurity.ts:74`) | `provider_events` `(provider='twilio', provider_event_id=MessageSid)` in the same transaction (`packages/domain/src/server/sms.ts:50-57`); `messages.provider_message_id` unique (`sms.ts:66`) | `realtime.publish`, `sms.send`, operator alerts (`sms.ts:74-91`) | `401` bad signature (`route.ts:22`), `500` unhandled (`route.ts:39`) |
| `POST /api/webhooks/twilio/status` | Twilio Messaging | HMAC-SHA1, optional key SID (`route.ts:18`) | No `provider_events` row. Dedupe by message-status transition guard `shouldApplyMessageStatusTransition` (`sms.ts:181`) and `messages.provider_message_id`; business resolved by provider/message/notification/operator-delivery ID (`route.ts:29-39`) | `realtime.publish`, `sms.syncPrice` (`sms.ts:192-209`) | `401` bad signature (`route.ts:19`), `503` + `Retry-After: 60` on durable write failure (`route.ts:50`) |
| `POST /twilio/voice/inbound` | Twilio Voice | HMAC-SHA1 (`apps/voice-gateway/src/telephony/routes.ts:120-125`; `twilioRequest.ts:52`) | `calls` keyed by Twilio `CallSid` via backend `/voice/call/start` (`routes.ts:51`); snapshot cached in process memory (`server.ts:33`) | Backend call initialization; no outbox | `403` bad signature (`routes.ts:128`, non-retryable) |
| `POST /twilio/voice/stream-status` | Twilio Voice | HMAC-SHA1 (`routes.ts:205-210`) | None; log only (`routes.ts:217-225`) | None | `403` bad signature (`routes.ts:213`); otherwise `204` |
| `POST /twilio/voice/call-status` | Twilio Voice | HMAC-SHA1 (`routes.ts:239-244`) | `calls.provider_call_id` update via `/voice/call/reconcile-status` (`apps/admin/app/voice/[...segments]/route.ts:350`; `packages/domain/src/server/voice.ts:221`). No event-ID dedupe; `SequenceNumber` is logged but not persisted (`routes.ts:251-262`) | `realtime.publish`, `call.syncPrice` (`voice.ts:230-236`) | `403` bad signature (`routes.ts:246`); backend failure raises an uncaught `500` with no `Retry-After` (`routes.ts:280`). The intended `503` + `Retry-After: 1` branch checks `reason === "unknown_call"` (`routes.ts:295,303-305`) but the backend returns `"call_not_found"` (`apps/admin/app/voice/[...segments]/route.ts:353`), so early callbacks fall through to `204` (see §2 flag) |
| `POST /twilio/voice/transfer-action` | Twilio Voice | HMAC-SHA1 (`routes.ts:330-335`) | `calls` update by `callId` via `setTransferState`/`completeCall` (`voice.ts:201,156`). Outbox `dedupe_key` includes `revision`, so a replay creates a new key (see §4) | `realtime.publish`, `conversation.finalizeSession` (`voice.ts:182-197,208-215`) | `403` bad signature (`routes.ts:337`), `400` missing `callId` (`routes.ts:345`); backend failure raises an uncaught `500` (`routes.ts:362-371`) |
| `UPGRADE /media-stream` | Twilio Media Streams | HMAC-SHA1 over `wss`/`https` URL (`server.ts:100-105`; `twilioRequest.ts:82`) | In-memory WebSocket session only (`server.ts:129-134`); nothing durable | Live OpenAI Realtime session | `503` maintenance (`server.ts:85-88`), `404` wrong path (`server.ts:95`), `401` bad signature (`server.ts:117`), `503` missing `OPENAI_API_KEY` (`server.ts:124`) |

Ignored-but-accepted paths: Polar unknown/missing business (`route.ts:39,42`), Twilio SMS with no resolved business (`apps/admin/app/api/webhooks/twilio/sms/route.ts:26`), and Twilio status with no resolved business (`route.ts:40`) return `2xx` and are permanently dropped. They are not retried by the provider. Resend always persists a `provider_events` row even when no business resolves (`route.ts:30`), so it is not dropped.

## 2. Provider retry behavior and retryability

Retry schedules below are the providers' documented behavior and must be confirmed and recorded by the provider owner.

| Provider | Retry on non-2xx | Current handler retryable? |
| --- | --- | --- |
| Polar (Standard Webhooks) | Yes — failed deliveries are retried with backoff for a limited retention period (confirm schedule). | `500` is retryable and appropriate. `401`/`400` are correctly non-retryable (retry cannot fix signature or payload). |
| Resend (Svix) | Yes — Svix retries non-2xx with exponential backoff for up to 24 hours by default (confirm schedule). | `500`/`503` are retryable. `401`/`400` are correctly non-retryable. `503` signals a configuration fault the owner must resolve, not just retry. |
| Twilio Messaging (inbound SMS) | Yes — Twilio retries non-2xx message webhooks with backoff (confirm window). | `500` is retryable. `401` is correctly non-retryable. The `500` carries no `Retry-After`; owner should confirm Twilio's default cadence is acceptable. |
| Twilio Messaging (status callback) | Yes — Twilio retries non-2xx status callbacks. | Confirmed retryable: `503` + `Retry-After: 60` on durable write failure (`route.ts:50`; test `apps/admin/app/api/webhooks/twilio/status/route.test.ts:19-25`). |
| Twilio Voice (status/action callbacks) | Yes in class — Twilio retries non-2xx Voice callbacks (confirm count and ordering guarantees). | **Flag (two issues).** (1) The gateway's retry branch tests `reason === "unknown_call"` (`routes.ts:295`) but the admin backend returns `reason: "call_not_found"` (`apps/admin/app/voice/[...segments]/route.ts:353`). The mismatch means a status callback that arrives before call-record initialization receives `204` (success) and is silently dropped; Twilio will not retry. The unit test mocks `"unknown_call"`, so it does not catch this (`routes.test.ts:234`). (2) Backend failures in `call-status` and `transfer-action` fall through to an uncaught `500` with **no `Retry-After`**. Retry is desired because the call record or transfer outcome is not durable until the backend succeeds. The provider owner must confirm Twilio retries these callbacks, the acceptable window, and the fix for the reason-string mismatch. |
| Twilio Voice (`voice/inbound`) | Not retryable by response class. | `403` on bad signature is correctly non-retryable (Twilio does not retry 4xx). A backend failure in `initializeInboundCallRecord` is swallowed and the handler still returns `200` TwiML (`routes.ts:95-104`), so call initialization can be lost without an error signal. |
| Twilio Media Streams (`UPGRADE`) | No — a WebSocket upgrade is not an HTTP webhook and is not replayed. | Not applicable. A rejected or dropped upgrade has no provider retry; the live call loses media. |

## 3. Pause / drain / retry window plan

Recommended ordering relative to the legacy write freeze and replacement maintenance mode:

1. **Publish the window** and name the provider coordinator, reconciliation owner, and rollback authority (all `UNASSIGNED` until recorded).
2. **Provider pause or retry allowance** (below), before any replacement maintenance.
3. **Legacy write freeze** enforced and evidenced ([legacy write freeze](./legacy-write-freeze.md)).
4. **Replacement maintenance mode** (`LOBBYSTACK_MAINTENANCE_MODE=true`, workers restarted) so admin webhooks are rejected before validation and gateway routes return/close `503` ([production rehearsal](../migrations/production-rehearsal.md):67-69; `apps/admin/proxy.ts:64`; `apps/voice-gateway/src/http/server.ts:42,85`).
5. **Observation window** — at least one full provider retry cycle per provider, plus one business-hours period for Twilio Messaging. The owner sets the exact duration in the release record.
6. **Cutover or return**, then replay/reconcile per §4.

Per provider:

- **Polar** — pause the endpoint in Polar (disable delivery) rather than relying on retries, because Polar's retention window is finite. Accepted events remain in `provider_events` and can be replayed from the Polar dashboard after return. Observe `provider_events` for `provider='polar'`.
- **Resend** — pause the endpoint in Svix; retries can also be triggered from the Svix dashboard. Observe `provider_events` for `provider='resend'`. If `RESEND_WEBHOOKS_ENABLED` is `false`, the harness removes the secret and the route returns `503` ([production readiness](../validation/production-readiness.md):70).
- **Twilio Messaging** — inbound SMS cannot be paused without changing the number's webhook URL. Either accept Twilio retries during maintenance (non-2xx) or temporarily point the messaging webhook at a controlled endpoint that records deliveries for replay. Confirm the retry window with the Twilio owner.
- **Twilio Voice** — inbound calls cannot be paused by the application. Route the number to legacy or to a controlled greeting before maintenance if calls must be preserved; otherwise calls during maintenance fail. Voice status/action callbacks are accepted only after maintenance ends.
- **Twilio Media Streams** — drain only: allow active calls to finish and stop admitting new inbound calls. Upgrades are not replayable.

## 4. Reconciliation plan

There is no durable inbound buffer. What is and is not preserved:

- **Preserved on acceptance:** a `provider_events` row for Polar, Resend, and inbound SMS only; the corresponding outbox row(s); domain state updates (messages, calls, subscriptions) in the same transaction. See `providerEvents` unique index (`packages/db/src/schema/index.ts:1151`) and outbox unique `dedupe_key` (`index.ts:1176`).
- **Not preserved:** rejected requests (bad signature, malformed payload, maintenance `503`, unhandled `500`) and accepted-but-ignored events (unknown/unresolved business). Only provider retry or owner-driven replay can recover these.
- **Voice `call-status`/`transfer-action`:** no `provider_events` row. Reconciliation must use `calls.provider_call_id` plus `providerUpdatedAt`/`SequenceNumber` ordering. `reconcileCallStatus` sets `updatedAt` from `providerUpdatedAt` but does not reject older deliveries, so out-of-order replays can regress status (`packages/domain/src/server/voice.ts:226`). A callback whose reason string does not match `"unknown_call"` returns `204` and is not recorded at all, so it cannot be reconciled later. The owner must define ordering rules and resolve the reason-string mismatch.
- **`transfer-action`:** `setTransferState`/`completeCall` bump `revision`, and the outbox key embeds `revision` (`voice.ts:182-197,208-215`), so replay emits new outbox rows rather than being deduplicated. Treat transfer replays as at-least-once.

Replay-safe idempotency keys:

| Provider | Event key | Downstream dedupe |
| --- | --- | --- |
| Polar | `(provider='polar', webhook-id)` | outbox `provider-event:<webhook-id>:billing` |
| Resend | `(provider='resend', svix-id)` | outbox `provider-event:<svix-id>:email` |
| Twilio SMS | `(provider='twilio', MessageSid)` | `messages.provider_message_id`; outbox message keys |
| Twilio status | message/notification/operator-delivery ID + status transition guard | outbox `message:<id>:delivery:<status>` / `:price:<status>` |
| Twilio voice | `calls.provider_call_id` (no event key) | outbox key includes `revision` (not replay-stable) |

Reconciliation accounting is by aggregate counts only, using `provider_events` (`status`, `provider`, `created_at`) and `outbox_messages` (`published_at`, `dead_lettered_at`, `attempts`). Accepted events with no outbox row, or ignored events with no row, cannot be reconstructed from local state.

## 5. In-flight work handling

| Work | Preserved? | Lost on maintenance/restart |
| --- | --- | --- |
| Active voice calls | No | In-memory media/session state in the gateway (`server.ts:33`); live call audio path |
| Media streams | No | WebSocket session; not replayable |
| Inbound SMS | Partially | Events delivered during `503` are lost unless Twilio retries |
| Outbound SMS | In `outbox_messages` | Dispatch is delayed; jobs resume after worker restart |
| Domain jobs / outbox | Yes (PostgreSQL) | Delayed dispatch; `attempts` and dead-lettering persist (`packages/db/src/outbox.ts:9-13`) |
| Provider callbacks | No | Rejected callbacks leave no record; only provider retry recovers them |

## 6. Ownership and approval

All owners are `UNASSIGNED` until named in the restricted release record. Missing approval blocks the item.

| Role | Owner | Required approval |
| --- | --- | --- |
| Polar provider owner | UNASSIGNED | Approve pause/retry window, endpoint replay, and retry schedule |
| Resend provider owner | UNASSIGNED | Approve pause/Svix replay and 24-hour retry window |
| Twilio provider owner | UNASSIGNED | Approve SMS and Voice pause/retry handling, `call-status`/`transfer-action` retry window, and media-stream drain |
| Replacement owner | UNASSIGNED | Approve maintenance entry/exit, endpoint routing, and observation window |
| Reconciliation owner | UNASSIGNED | Approve replay rules, ordering for voice callbacks, and accounting results |
| Reviewer | UNASSIGNED | Independently verify this plan and the execution evidence |

## 7. Operator verification checklist

Run in an isolated, disposable environment with non-customer fixtures. Do not run destructive writes against production. Steps 1-4 and 9 are read-only; steps 5-8 send signed test deliveries only to the isolated target.

1. Confirm the maintenance boundary: with `LOBBYSTACK_MAINTENANCE_MODE=true`, verify admin `/api/webhooks/*` returns `503` before handler execution (`apps/admin/proxy.ts:64`) and gateway routes/upgrades return `503` (`server.ts:42,85`).
2. Confirm signature rejection: send a payload with an invalid signature to each route and record `401`/`403`, with no `provider_events` row created.
3. Confirm the retryable statuses in §2 match the deployed code by inspecting responses for each failure path.
4. Record provider retry schedules from each provider's dashboard/webhook log and attach to the restricted evidence.
5. **Duplicate-delivery proof (one provider event):** send the same signed Polar (or Resend) payload twice; query `select count(*) from provider_events where provider=... and provider_event_id=...` and confirm `1`; confirm exactly one matching `outbox_messages` row.
6. **Twilio SMS duplicate proof:** deliver the same `MessageSid` twice and confirm one `provider_events` row and one inbound `messages` row (`packages/domain/src/server/sms.ts:50-66`).
7. **Status replay proof:** resend an older Twilio status callback and confirm the transition guard prevents a backward status change (`sms.ts:181`); record the observed result and any regression for voice, where no such guard exists.
8. **Voice early-callback proof:** send a signed `call-status` for an uninitialized `CallSid` and record the status. Expected from the code is `204` (dropped) because `"call_not_found"` does not match the `"unknown_call"` branch; record this as an open defect, not a pass.
9. **Outbox accounting:** after the observation window, compare counts of accepted `provider_events` against published/dead-lettered `outbox_messages`; attach aggregate counts only.
10. Re-run the maintenance boundary check and confirm clean exit before recording a disposition.

## 8. Status

This is a plan requiring provider-owner approval. It is not a completed certification, no evidence in this document is production evidence, and `releaseCertified` remains `false`. The `Provider event plan` item stays `BLOCKED` until every owner in §6 approves and the §7 checks are executed and independently reviewed.
