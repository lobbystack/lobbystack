# Spec: staff answers first

Status: built on Twilio, waiting on manual staging calls. Telnyx waits on the open questions in the spike results.

## Problem Statement

Many owners want to take their own calls and use the receptionist as a backstop. Today they can only do that with carrier codes: "Calls you miss" in `mintlify/getting-started/forward-calls.mdx`. Those codes leave LobbyStack out of the decision:

- The carrier sets the ring time, and some carriers charge for forwarded calls.
- Nothing changes with business hours.
- A setup step on the customer's phone can fail, and support can't see why.
- A business that gives out its LobbyStack number has no way to ring staff first.

Reception.ai offers this as a setting called **Staff answers first**, alongside carrier forwarding.

## Solution

A business turns on **Staff answers first** in AI settings. A call to its LobbyStack number rings one staff phone for a set time. If the staff member accepts, they talk to the caller. If not, the receptionist answers as usual.

Carrier forwarding stays as it is. The two work independently, and the Help Center explains when to use each.

## Scope

### In the first version

- Modes: `never` (the default), `business_hours` and `always`. `business_hours` uses `isBusinessOpen` from `packages/shared/src/transferPolicy.ts`.
- One staff phone number, checked by `assertTransferNumberAllowed`, which applies the trial lock to the verified mobile.
- Ring time: 10, 15, 20, 30, 45 or 60 seconds, 15 by default.
- Press-to-accept, always on. The staff member hears who's calling and presses 1. Without this, a phone's voicemail counts as an answer and the receptionist never gets the call.
- Optional message before ringing, and optional handover message. Each holds up to 200 characters, and the carrier reads them in the business's language.
- Twilio numbers. The setting shows as unavailable on a Telnyx number.

### Left for later

- Several staff phones, together or in turn.
- Custom hours.
- Ring music. The caller hears ringing.
- Time off from the Employees page.

## Key risk: handing the call to GPT-Live

No code dials GPT-Live from a voice webhook today. Numbers reach it through carrier-level SIP routing: a Twilio Elastic SIP trunk, or a Telnyx FQDN connection. There's no `<Sip>` anywhere in the repository.

A staff-first number has to go to a voice webhook first, and the webhook then hands an unanswered call to OpenAI with `<Dial><Sip>`. That path is unproven, so it comes first.

### Step 0: carrier spike

Run real calls on both carriers from a scratch number. Change no production code. Answer each question:

1. Does the `<Sip>` leg reach OpenAI over TLS with SRTP? OpenAI requires SRTP, and neither carrier's docs confirm it for this verb.
2. Can the dialled number reach `/api/webhooks/openai/live`? On Twilio, try a `P-Called-Party-ID` header, which the route already reads, or an `x-` header. Telnyx documents no custom headers on `<Sip>`, and `X-Telnyx-Connection-id` would probably name the TeXML application.
3. Does OpenAI keep custom headers in `sip_headers`? The warning at `route.ts:67` logs the names on a miss.
4. Does the SIP `From` hold the caller's number? Without it, the call gets a blank contact and blocking stops working.
5. Does a second `<Dial>` keep the caller hearing ringing, with `answerOnBridge`, or do they hear silence?
6. Does a transfer work from this leg? Twilio needs `referUrl`, or it raises error 13802. TeXML has `referUrl` too.
7. Does press-to-accept work with a `<Number url>` on Twilio and its TeXML equivalent?
8. Do Canadian numbers work on both carriers? Reception.ai doesn't offer this on its own Canadian numbers, and its docs don't say why.
9. What does a call cost on each carrier, with the ringing leg and the `<Sip>` leg?

**If a carrier fails question 1, 2 or 4,** the feature ships without that carrier, and the setting says so for its numbers. If Twilio fails, stop and rethink the design.

#### Spike results, 2026-10-31

Calls ran from scratch numbers against the shared OpenAI project, through staging's receptionist. Nobody listened to them, so the audio results come from the worker's logs. Twilio passed the blocking questions. Telnyx has one blocker, press-to-accept, and two open questions.

| Question | Twilio | Telnyx |
|---|---|---|
| 1. TLS and SRTP | Yes, with `;transport=tls;secure=true` in the URI. The `secure="true"` attribute fails with `Live SIP calls require SRTP`. Audio ran both ways. | Yes, with the same URI. |
| 2. Dialled number | Yes, with `X-LobbyStack-Called`. `P-Called-Party-ID` and a URI parameter never reached the webhook. | Yes, with `X-LobbyStack-Called`. |
| 3. Custom headers | Yes. `sip_headers` kept them. | Yes. `sip_headers` kept them. |
| 4. Caller in `From` | Likely. The leg's `from` holds the caller, but the webhook doesn't log the value. Check the staging call records. | Likely, with the same gap. |
| 5. Ringing on a second `<Dial>` | Likely. The caller's leg stays unanswered through the staff ring and the second `<Dial>`, then answers when GPT-Live does. Nobody listened. | Open. `/voice` reports `in-progress`, but the caller's Twilio leg stayed unanswered through a staff ring. Nobody tested a second `<Dial>`. |
| 6. Transfers | Yes, with `referUrl`. The session ended as `transferred`, and the staff leg ran 18 seconds. | Open. The session ended as `transferred`, but `referUrl` never fired, so we don't know where the call went. |
| 7. Press-to-accept | Yes. Pressing 1 bridges the call. | Partly. See "Voicemail" below. |
| 8. Canadian numbers | Yes. A Canadian number took an answered call. | Open. A call from Twilio never arrived. A call from a Telnyx number did. |
| 9. Cost | About $0.004 per SIP leg and $0.0085 inbound on calls under a minute, plus $0.014 per staff ring answered. | Unmeasured. The balance fell $5.72 over the spike, including about $4 for the two numbers. |

The results change the design in four ways:

- **Dialled number:** `liveRoute` reads `X-LobbyStack-Called`, shipped in #357. Staging and production share an OpenAI project, so an old production route rejects these calls before staging can accept them. Production has to read a new header first.
- **SIP address:** the `sipAddress` helper builds `sip:<project>@sip.api.openai.com;transport=tls;secure=true`.
- **Voicemail:** when a staff phone answers and nobody presses 1, Twilio reports `DialCallStatus=completed` with `DialBridged=false`, so the `action` webhook has to read `DialBridged`. On Telnyx, the caller's leg connected when the unanswered whisper ended, so voicemail may keep the call. Telnyx sends no `DialBridged`. Solve this before Telnyx ships.
- **Refusals:** a rejected `<Sip>` leg reaches `action` as `DialCallStatus=failed`. Telnyx adds `SipHangupCause`, but Twilio sent no `SipResponseCode` in these calls, so refusal handling on Twilio can't rely on that field yet. Twilio documents the field as `DialSipResponseCode`, which the spike didn't check. The webhook reads it for a 603 and treats a missing code as a refusal.

## Design

### Call flow

1. The number's voice target is a webhook, so the carrier asks LobbyStack what to do.
2. The webhook finds the business and reads its settings. A blocked caller is rejected here, and a trial or plan limit follows today's rules.
3. Outside the mode's hours, the webhook goes straight to `<Dial><Sip>`.
4. Otherwise it answers with the optional message and a `<Dial>` to the staff phone, with `timeout` and `action` set.
5. The staff leg plays who's calling and waits for a press of 1.
6. The `action` webhook reads the result. If the staff member accepted, the call ends when they hang up. Otherwise it plays the handover message and runs `<Dial><Sip>`.
7. GPT-Live answers through `/api/webhooks/openai/live`, as on any other call.

Twilio adds a 5-second buffer to `timeout`, so subtract it. Telnyx caps `timeout` at 120 seconds.

### Routing

`NumberRoutingMode` gains `staff_first`, and `desiredNumberRouting` in `numberTrials.ts` reads the setting as well as the trial, so refresh jobs don't pull the number back to the trunk. Saving the setting queues `phoneNumber.route`.

The mode stays `staff_first` whenever the setting is on, and the webhook applies hours on each call. A routing change per hour would be slow, and it would add carrier API calls.

The trial's `fallback` mode wins over `staff_first`.

### Refused calls

On the `<Dial><Sip>` path, a refusal from GPT-Live comes back to the `action` URL as `DialCallStatus`, not through the trunk's disaster recovery URL or the Telnyx stored forward. The `action` webhook has to handle 503, 486 and 603 the way those paths do today, using `resolveNumberFallback`.

Telnyx clears its stored forward on a TeXML application, so this route is the only one left there.

### Loops

The staff phone can't be the dialled number, and can't be a line that forwards to it:

- The webhook refuses to ring `ForwardedFrom` on Twilio.
- Telnyx sends no such field, so its loop guard has to come from a call that re-enters the webhook within the same ring window.
- The setting's help text warns against entering a phone that forwards to LobbyStack, because a forward on no answer would otherwise bring the call back.

### Webhook failure

The trunk answers calls today with no LobbyStack code in the way, and this mode adds a webhook that can fail. Set the number's voice fallback URL to a route that goes straight to `<Dial><Sip>`, so an error sends the caller to the receptionist.

### Call records and billing

Today, a call that never reaches GPT-Live has no record. Staff-answered calls need one, or the owner sees nothing:

- Add a new provider value in `calls`, keyed on the carrier's call ID, with `billingExcluded` set to true.
- Create it from the `action` webhook after a staff member accepts. Reuse the contact lookup from `startCall`, and skip its session and minutes.
- Add an outcome "Answered by your team", with copy in all four languages.
- Exclude these calls from `callRows` in `analytics.ts`, which has no `billingExcluded` filter today. Otherwise they count as calls the receptionist took.
- Keep them out of the trial call count in `numberTrials.ts`.

Each staff ring uses one `outbound_call_attempts`, like a transfer: the carrier bills the outbound leg either way. Calls bill at Programmable Voice rates instead of trunking rates, so check the margin against the spike's costs. `call.syncPrice` matches trunk legs only, and needs a path for these calls.

## Implementation order

Each step lands on its own.

1. **Spike:** run step 0 and record the answers in this spec.
2. **Settings:** add a migration with these columns on `receptionist_profiles`, plus the shared enum and validation in `readReceptionistSettingsChange`. The public API, the snapshot and `openapi.json` follow the `voice` field. Templates strip the staff number, as they do `transfer_number`.
3. **Routing:** add `staff_first` to both carriers, and a `sipAddress` helper. The admin app needs `OPENAI_PROJECT_ID`.
4. **Webhooks:** add the new voice and action routes for each carrier, with signature checks. Keep `/api/webhooks/twilio/voice` for fallback, because it's also the disaster recovery URL.
5. **Handover:** update `liveRoute` to read the dialled number from the new leg.
6. **Records:** add the call record, outcome, analytics filter and attempt metering.
7. **Dashboard:** add the AI settings section with keys in en, fr, es and sr, plus `web.agent.settings_saved` with `setting: "staff_first"`.
8. **Docs:** update `agent/ai-settings/overview.mdx`, `getting-started/forward-calls.mdx`, `billing/usage.mdx`, `dashboard/calls.mdx`, `dashboard/analytics.mdx` and `docs/voice/runtime.md`.

## Verification

- **Unit tests:** cover mode and hours decisions, webhook responses for each `DialCallStatus`, and routing precedence with a trial.
- **Integration tests:** cover the migration, RLS, the call record and metering against PostgreSQL. Run `pnpm db:check` and `pnpm db:verify-rls`.
- **Telemetry:** a test asserts the event fires from its production path, and `pnpm telemetry:coverage` passes.
- **Voice:** `pnpm voice:eval` runs no worse than `main`. `pnpm voice:call` on staging covers both carriers.
- **Manual calls on staging, on each carrier:**
  - Staff accepts.
  - Staff declines.
  - Staff lets it ring.
  - The staff phone goes to voicemail.
  - The call comes in outside hours.
  - A blocked caller calls.
  - A trial runs out of minutes.
  - A plan runs out of minutes.
  - The receptionist transfers a call after a handover.
  - A US and a Canadian number each take a call.

## Decisions

1. **Billing:** a staff-answered call uses one transfer attempt and no plan minutes. Free doesn't get this feature, because its two attempts would run out within two calls.
2. **Staff phone:** a new field that starts with the transfer number filled in, because a business may want different phones.
3. **Custom hours:** not in the first version.
