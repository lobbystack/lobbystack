# Use the telemetry event taxonomy

This reference assigns event ownership and defines the properties required for product and operational telemetry.

## Ownership

- `apps/admin` emits operator intent and workflow events
- `apps/admin` and `apps/worker` emit authoritative business outcome events

Do not duplicate ownership between runtimes unless there is a specific analytics reason.

## Event families

### Web events

- `web.auth.login_succeeded`
- `web.auth.signup_succeeded`
- `web.workspace.business_switched`
- `web.page.home_viewed`
- `web.page.calls_viewed`
- `web.page.call_detail_viewed`
- `web.page.messages_viewed`
- `web.page.contacts_viewed`
- `web.page.analytics_viewed`
- `web.page.agent_viewed`
- `web.page.settings_viewed`
- `web.contacts.contact_opened`
- `web.messages.thread_opened`
- `web.messages.reply_sent`
- `web.agent.settings_saved`
- `web.onboarding.number_claim_started`
- `web.onboarding.number_claim_completed`
- `web.onboarding.plan_checkout_completed`
- `web.activation.first_call_completed`
- `web.activation.upgrade_prompt_shown`
- `web.activation.upgrade_prompt_clicked`
- `web.activation.abandon_intent`
- `web.knowledge.upload_started`
- `web.knowledge.upload_completed`
- `web.integration.calendar_connect_started`
- `web.integration.calendar_connect_completed`
- `web.integration.calendar_connect_failed`
- `web.integration.calendar_disconnect_completed`
- `web.voice.follow_up_completed`

### Voice events

- `voice.call_started`
- `voice.call_completed`
- `voice.short_call_waived`: a call ran under 10 seconds, so the business wasn't charged, though the provider may still bill us. Carries the provider's billed seconds, the measured length and, for GPT-Live, the estimated cost.
- `voice.transfer_state_changed`
- `voice.transfer_requested`
- `voice.transfer_completed`
- `voice.snapshot_loaded`
- `voice.provider_cost_recorded`
- `voice.delegation_completed`: the worker answered one GPT-Live delegation with the receptionist agent. Carries `agentMs` (agent run time), `totalMs` (from the delegation event to the answer, including the wait for the caller's last words), `tools` (distinct tool names), `toolCount`, `modelSteps` (model calls the agent made), `directAnswer` (true when a tool result went to GPT-Live without a model call to phrase it), `toolMs` (time spent in tools), `modelMs` (`agentMs` minus `toolMs`) and `failed`. The worker also records each delegation's tokens and cost as a `$ai_generation` with the operation `voice.delegation`. It never carries the request, the answer or the caller's number.
- `voice.call_latency_recorded`: one summary per GPT-Live call, sent when the worker stops handling the call. See [GPT-Live call latency](#gpt-live-call-latency).

#### GPT-Live call latency

The worker measures `voice.call_latency_recorded` from the session timeline that the sideband reports, in milliseconds from the start of the OpenAI session. Network delay between OpenAI and the worker doesn't affect these numbers.

GPT-Live sends no speech-started, speech-stopped or input-committed event. The worker takes the end of the caller's turn from the `end_ms` of their last `session.input_transcript.delta`. It takes the start of the receptionist's speech from the `start_ms` of reflected `session.output_audio.delta` events. If the sideband delivers no reflected audio, it uses `session.output_transcript.delta` instead, and `speechTimingSource` says which one it used.

| Property | Meaning |
| --- | --- |
| `firstSpeechMs` | When the receptionist first spoke, from the start of the session. |
| `greetingMs` | Same as `firstSpeechMs`, sent only when the receptionist spoke before the caller. |
| `greetedFirst` | The receptionist spoke before the caller. |
| `speechTimingSource` | `audio`, `transcript` or `none`. |
| `answerCount` | Caller turns the receptionist answered. |
| `answerP50Ms`, `answerP90Ms`, `answerMaxMs` | Silence between the caller's last transcribed word and the receptionist's answer, as nearest-rank percentiles. |
| `delegationCount`, `delegationFailedCount` | Delegations answered, and how many of them failed. |
| `delegationP50TotalMs`, `delegationMaxTotalMs` | `totalMs` of those delegations. |
| `durationMs` | How long the worker held the call. |

The answer gap skips caller speech that ended while the receptionist was still talking, such as "mm-hmm" or an interruption, and answers that started before the caller finished. The session timeline starts when OpenAI starts the session, so ringing before a phone call is accepted doesn't count toward `greetingMs`.

### SMS events

- `sms.inbound_received`
- `sms.delivery_accepted`
- `sms.delivery_failed`
- `conversation.automation_paused`

### Appointment events

- `appointment.booked`
- `appointment.booking_failed`
- `appointment.rescheduled`
- `appointment.cancelled`
- `notification.delivery_failed`

### Prospect demo events

- `prospect_demo.viewed`
- `prospect_demo.call_started`
- `prospect_demo.call_completed`
- `prospect_demo.call_error`
- `prospect_demo.signup_clicked`
- `prospect_demo.claim_succeeded`
- `prospect_demo.claim_failed`

### Knowledge events

- `knowledge.document_indexed`
- `knowledge.search_executed`

### Integration events

- `integration.calendar_connected`
- `integration.calendar_sync_failed`

### Workflow and snapshot events

- `business.snapshot_refreshed`
- `workflow.started`
- `workflow.failed`

### Billing events

`billing.subscription_started` fires once, when a workspace crosses from free into a live paid plan. Renewals, plan changes between paid tiers, and recovery from `past_due` do not repeat it, so the event counts subscriptions rather than webhooks. The worker records it after the reconciling transaction commits, which means a reporting failure cannot roll back a payment.

- `billing.subscription_started`

### Operations events

Outbox health is reported durably from the worker. A tenant-scoped `outbox.backlogSample` job runs every 60 seconds, counts that business's publishable outbox rows, and records `ops.outbox.backlog_sample` with `deploymentMode` and `backlogBucket`. A zero backlog is not emitted, so the event tracks real backlog without idle-workspace noise.

`ops.outbox.flush_failed` remains a registered but undelivered contract. The dispatcher runs as `lobbystack_dispatcher`, which has no write grant on `product_events`, and a global poll failure has no tenant to scope an RLS-safe row to. Until a worker-role consumer exists, dispatcher failures are tracked by OpenTelemetry counters (`lobbystack.outbox.dispatch_failures`, `lobbystack.outbox.dead_lettered`, `lobbystack.outbox.poll_failures`).

- `ops.outbox.backlog_sample`
- `ops.outbox.flush_failed`
- `ops.service.health_check`
- `ops.service.health_check_failed`

## Shared defaults

All meaningful product and business events should include:

- `deploymentMode`
- `businessId` whenever the event happens within a business workspace or business runtime

Use these identifiers whenever they are available:

- `businessId`
- `conversationId`
- `callId`
- `messageId`
- `appointmentId`
- `channel`
- `provider`
- `model`

## Required properties by category

### Web workflow events

Always include:

- `businessId`
- `deploymentMode`

Add route or target identifiers when relevant:

- page views: `pathname`
- business switching: `previousBusinessId`
- contacts: `contactId`
- message thread events: `conversationId`, `channel`
- settings saves: `setting`
- onboarding start events: `countryCode`
- knowledge uploads: `section`, `contentType`
- calendar disconnects: `provider`, `scope`; add `staffId` only for staff scope
- voice follow-up: `callId`, `inboxItemId`

### Conversation events

Always include:

- `businessId`
- `deploymentMode`
- `conversationId`
- `channel`

Add message-level context when relevant:

- `messageId`
- `provider`
- `providerStatus`
- `deliveryContext` for SMS delivery outcomes

### Voice events

Always include:

- `businessId`
- `deploymentMode`
- `callId`
- `provider`

Add when available:

- `conversationId`
- `channel`
- `reason` for booking failures
- `model`

### Appointment events

Always include:

- `businessId`
- `deploymentMode`

Add when relevant:

- `appointmentId`
- `serviceId`
- `sourceChannel`
- `channel`

### Integration events

Always include:

- `businessId`
- `deploymentMode`
- `provider`
- `scope`

Add when staff-scoped:

- `staffId`

### Workflow events

Emit `workflow.started` for event-driven business jobs, including delayed jobs. Do not emit it for envelopes explicitly marked as recurring maintenance or for internal product-event retention continuations; these can run for every business even when they immediately skip. Continue to emit `workflow.failed` when recurring maintenance fails. Do not infer recurrence from the legacy `scheduled` flag because delayed jobs also set it.

Always include:

- `deploymentMode`
- `workflowName`
- `scope`

Include `businessId` for business-scoped jobs. Global workflow events require a separate RLS-safe durable path before they can be delivered.

### Service health events

Always include:

- `deploymentMode`
- `service`
- `status`
- `latencyMs`

Add when relevant:

- `httpStatusCode`
- `errorKind`
- `targetUrlHost`

### Alertable exceptions

Unexpected crashes, provider failures, service health failures, and observed write/action/http handler failures should include:

- `runtime`
- `service`
- `operation`
- `deploymentMode`
- `alertable`
- `expected`
- `$exception_level`
- `$exception_type`
- `$exception_message`

Add when relevant:

- `provider`
- safe IDs such as `businessId`, `callId`, `conversationId`, `messageId`, or `appointmentId`

## Property guidelines

- Prefer aggregate facts over raw content
- Keep event properties stable and human-readable
- Use booleans and counts instead of raw payload dumps
- Use IDs for correlation, not customer identity

Examples:

- good: `mediaCount: 2`
- good: `providerStatus: "queued"`
- good: `sourceChannel: "voice"`
- avoid: full SMS body
- avoid: transcript text
- avoid: prompt text
- avoid: customer phone number
- avoid: customer name

## Group analytics

PostHog should be modeled around `business` groups:

- browser events identify operators as `user:{userId}`
- business outcome events use `system:business:{businessId}`
- grouped analytics use `business:{businessId}`
- customers are never PostHog persons

## AI traces

The domain package records AI traces with these PostHog event types:

- `$ai_trace`
- `$ai_generation`
- `$ai_span`

Trace properties should stay redacted and focus on:

- trace ID
- model
- provider
- latency
- tool invocation
- error state
