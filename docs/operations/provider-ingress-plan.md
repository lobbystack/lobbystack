# Provider event ingress, retry, and reconciliation plan

This document satisfies the `Provider event plan` deliverable in [production readiness](../validation/production-readiness.md). It is a plan, not a certification. It requires explicit approval from each responsible provider owner before any production rehearsal or cutover. Until then `releaseCertified` remains `false` and the readiness item stays `BLOCKED`.

There is no durable inbound provider-event buffer. Every handler below persists durable records only after signature validation and business resolution; a rejected request leaves no record and depends on the provider retrying.

## 1. Inbound callback inventory

Response status is the status returned to the provider.

| Route | Provider | Signature verification | Idempotency / dedupe store | Enqueues | Response on failure |
| --- | --- | --- | --- | --- | --- |
| `POST /api/webhooks/polar` | Polar | Standard Webhooks HMAC, legacy + base64 keys (`apps/admin/app/api/webhooks/polar/route.ts:13`; `packages/providers/src/polar/webhook.ts:9`) | `provider_events` unique `(provider, provider_event_id)` with `onConflictDoNothing` (`route.ts:44`; `packages/db/src/schema/index.ts:1151`); outbox `dedupe_key` `provider-event:<webhook-id>:billing` (`route.ts:46`) | `billing.reconcile` outbox | `401` bad signature (`route.ts:30`), `400` malformed (`route.ts:34`), `500` unhandled (`route.ts:55`) |
| `POST /api/webhooks/twilio/sms` | Twilio Messaging | HMAC-SHA1 over sorted params (`route.ts:21`; `packages/shared/src/twilioSecurity.ts:74`) | `provider_events` `(provider='twilio', provider_event_id=MessageSid)` in the same transaction (`packages/domain/src/server/sms.ts:50-57`); `messages.provider_message_id` unique (`sms.ts:66`) | `realtime.publish`, `sms.send`, operator alerts (`sms.ts:74-91`) | `401` bad signature (`route.ts:22`), `500` unhandled (`route.ts:39`) |
| `POST /api/webhooks/twilio/status` | Twilio Messaging | HMAC-SHA1, optional key SID (`route.ts:18`) | No `provider_events` row. Dedupe by message-status transition guard `shouldApplyMessageStatusTransition` (`sms.ts:181`) and `messages.provider_message_id`; business resolved by provider/message/notification/operator-delivery ID (`route.ts:29-39`) | `realtime.publish`, `sms.syncPrice` (`sms.ts:192-209`) | `401` bad signature (`route.ts:19`), `503` + `Retry-After: 60` on durable write failure (`route.ts:50`) |
| `POST /api/webhooks/openai/live` | OpenAI (phone calls Twilio routes to the OpenAI SIP endpoint) | Standard Webhooks signature checked by `client.webhooks.unwrap` (`apps/admin/app/api/webhooks/openai/live/route.ts:29`) | No `provider_events` row. `calls.provider_call_id` holds the OpenAI session ID, so a redelivered event finds the existing call, accepts again, and reattaches the worker as a resume (`route.ts:157-160`) | Accepts the session and attaches the worker; no outbox | `404` when `LIVE_PROTOTYPE_ENABLED` is not `true` (`route.ts:24`), `400` bad signature (`route.ts:31`), `503` when the dialled-number lookup fails (`route.ts:71`), `503` in maintenance mode (`apps/admin/proxy.ts:113`), so calls fail during maintenance |

Ignored-but-accepted paths: Polar unknown/missing business (`route.ts:39,42`), Twilio SMS with no resolved business (`apps/admin/app/api/webhooks/twilio/sms/route.ts:26`), and Twilio status with no resolved business (`route.ts:40`) return `2xx` and are permanently dropped. They are not retried by the provider.

## 2. Provider retry behavior and retryability

Retry schedules below are the providers' documented behavior and must be confirmed and recorded by the provider owner.

| Provider | Retry on non-2xx | Current handler retryable? |
| --- | --- | --- |
| Polar (Standard Webhooks) | Yes — failed deliveries are retried with backoff for a limited retention period (confirm schedule). | `500` is retryable and appropriate. `401`/`400` are correctly non-retryable (retry cannot fix signature or payload). |
| Twilio Messaging (inbound SMS) | Yes — Twilio retries non-2xx message webhooks with backoff (confirm window). | `500` is retryable. `401` is correctly non-retryable. The `500` carries no `Retry-After`; owner should confirm Twilio's default cadence is acceptable. |
| Twilio Messaging (status callback) | Yes — Twilio retries non-2xx status callbacks. | Confirmed retryable: `503` + `Retry-After: 60` on durable write failure (`route.ts:50`; test `apps/admin/app/api/webhooks/twilio/status/route.test.ts:19-25`). |
| OpenAI (`live.transport.incoming`) | Yes: OpenAI delivers the event again after a non-2xx response (confirm schedule). | `503` from a failed number lookup is retryable, and the route relies on it (`route.ts:68-71`). `400` and `404` are non-retryable. A redelivery helps only while the caller still hears ringing. |

## 3. Pause / drain / retry window plan

Recommended ordering relative to replacement maintenance mode:

1. **Publish the window** and name the provider coordinator, reconciliation owner, and rollback authority (all `UNASSIGNED` until recorded).
2. **Provider pause or retry allowance** (below), before any replacement maintenance.
3. **Replacement maintenance mode** (`LOBBYSTACK_MAINTENANCE_MODE=true`, workers restarted) so admin webhooks, including `/api/webhooks/openai/live`, get `503` before validation (`apps/admin/proxy.ts:113`). Phone calls fail for the whole window.
4. **Observation window** — at least one full provider retry cycle per provider, plus one business-hours period for Twilio Messaging. The owner sets the exact duration in the release record.
5. **Cutover or return**, then replay/reconcile per §4.

Per provider:

- **Polar** — pause the endpoint in Polar (disable delivery) rather than relying on retries, because Polar's retention window is finite. Accepted events remain in `provider_events` and can be replayed from the Polar dashboard after return. Observe `provider_events` for `provider='polar'`.
- **Twilio Messaging** — inbound SMS cannot be paused without changing the number's webhook URL. Either accept Twilio retries during maintenance (non-2xx) or temporarily point the messaging webhook at a controlled endpoint that records deliveries for replay. Confirm the retry window with the Twilio owner.
- **Phone calls**: Twilio routes each call to the OpenAI SIP endpoint, and OpenAI sends `live.transport.incoming` to `/api/webhooks/openai/live`. The application can't pause calls, and maintenance mode fails them. If calls must be answered, route the numbers to a controlled greeting before maintenance. Calls in progress run on the worker; let them end before you restart workers.

## 4. Reconciliation plan

There is no durable inbound buffer. What is and is not preserved:

- **Preserved on acceptance:** a `provider_events` row for Polar and inbound SMS only; the corresponding outbox row(s); domain state updates (messages, calls, subscriptions) in the same transaction. See `providerEvents` unique index (`packages/db/src/schema/index.ts:1151`) and outbox unique `dedupe_key` (`index.ts:1176`).
- **Not preserved:** rejected requests (bad signature, malformed payload, maintenance `503`, unhandled `500`) and accepted-but-ignored events (unknown/unresolved business). Only provider retry or owner-driven replay can recover these.
- **Phone calls:** no `provider_events` row and nothing to replay. A call that fails during maintenance is gone; the caller has to call again.

Replay-safe idempotency keys:

| Provider | Event key | Downstream dedupe |
| --- | --- | --- |
| Polar | `(provider='polar', webhook-id)` | outbox `provider-event:<webhook-id>:billing` |
| Twilio SMS | `(provider='twilio', MessageSid)` | `messages.provider_message_id`; outbox message keys |
| Twilio status | message/notification/operator-delivery ID + status transition guard | outbox `message:<id>:delivery:<status>` / `:price:<status>` |

Reconciliation accounting is by aggregate counts only, using `provider_events` (`status`, `provider`, `created_at`) and `outbox_messages` (`published_at`, `dead_lettered_at`, `attempts`). Accepted events with no outbox row, or ignored events with no row, cannot be reconstructed from local state.

## 5. In-flight work handling

| Work | Preserved? | Lost on maintenance/restart |
| --- | --- | --- |
| Active voice calls | No | The worker holds each call's session in memory. On shutdown it lets calls finish for up to `LIVE_DRAIN_TIMEOUT_MS` or the Railway draining window, then ends them (`apps/worker/src/liveCalls.ts:146`) |
| Inbound SMS | Partially | Events delivered during `503` are lost unless Twilio retries |
| Outbound SMS | In `outbox_messages` | Dispatch is delayed; jobs resume after worker restart |
| Domain jobs / outbox | Yes (PostgreSQL) | Delayed dispatch; `attempts` and dead-lettering persist (`packages/db/src/outbox.ts:9-13`) |
| Provider callbacks | No | Rejected callbacks leave no record; only provider retry recovers them |

## 6. Ownership and approval

All owners are `UNASSIGNED` until named in the restricted release record. Missing approval blocks the item.

| Role | Owner | Required approval |
| --- | --- | --- |
| Polar provider owner | UNASSIGNED | Approve pause/retry window, endpoint replay, and retry schedule |
| Twilio provider owner | UNASSIGNED | Approve SMS pause/retry handling and call routing during maintenance |
| Replacement owner | UNASSIGNED | Approve maintenance entry/exit, endpoint routing, and observation window |
| Reconciliation owner | UNASSIGNED | Approve replay rules and accounting results |
| Reviewer | UNASSIGNED | Independently verify this plan and the execution evidence |

## 7. Operator verification checklist

Run in an isolated, disposable environment with non-customer fixtures. Do not run destructive writes against production. Steps 1-4 and 8 are read-only; steps 5-7 send signed test deliveries only to the isolated target.

1. Confirm the maintenance boundary: with `LOBBYSTACK_MAINTENANCE_MODE=true`, verify admin `/api/webhooks/*`, including `/api/webhooks/openai/live`, returns `503` before handler execution (`apps/admin/proxy.ts:113`).
2. Confirm signature rejection: send a payload with an invalid signature to each route and record `400`/`401`, with no `provider_events` row created.
3. Confirm the retryable statuses in §2 match the deployed code by inspecting responses for each failure path.
4. Record provider retry schedules from each provider's dashboard/webhook log and attach to the restricted evidence.
5. **Duplicate-delivery proof (one provider event):** send the same signed Polar payload twice; query `select count(*) from provider_events where provider=... and provider_event_id=...` and confirm `1`; confirm exactly one matching `outbox_messages` row.
6. **Twilio SMS duplicate proof:** deliver the same `MessageSid` twice and confirm one `provider_events` row and one inbound `messages` row (`packages/domain/src/server/sms.ts:50-66`).
7. **Status replay proof:** resend an older Twilio status callback and confirm the transition guard prevents a backward status change (`sms.ts:181`); record the observed result.
8. **Outbox accounting:** after the observation window, compare counts of accepted `provider_events` against published/dead-lettered `outbox_messages`; attach aggregate counts only.
9. Re-run the maintenance boundary check and confirm clean exit before recording a disposition.

## 8. Status

This is a plan requiring provider-owner approval. It is not a completed certification, no evidence in this document is production evidence, and `releaseCertified` remains `false`. The `Provider event plan` item stays `BLOCKED` until every owner in §6 approves and the §7 checks are executed and independently reviewed.
