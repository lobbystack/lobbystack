# Event Taxonomy

## Ownership

- `apps/web` emits operator intent and workflow events
- `convex` emits authoritative business outcome events
- `apps/voice-gateway` emits runtime observability and AI trace events

Do not duplicate ownership between runtimes unless there is a specific analytics reason.

## Web events

- `web.auth.login_succeeded`
- `web.auth.signup_succeeded`
- `web.workspace.business_switched`
- `web.page.home_viewed`
- `web.page.calls_viewed`
- `web.page.call_detail_viewed`
- `web.page.messages_viewed`
- `web.page.analytics_viewed`
- `web.page.agent_viewed`
- `web.page.settings_viewed`
- `web.onboarding.verify_phone_started`
- `web.onboarding.verify_phone_completed`
- `web.onboarding.number_claim_started`
- `web.onboarding.number_claim_completed`
- `web.knowledge.upload_started`
- `web.knowledge.upload_completed`
- `web.integration.calendar_connect_started`
- `web.integration.calendar_connect_completed`
- `web.integration.calendar_connect_failed`
- `web.voice.follow_up_completed`

## Domain events

### Voice

- `voice.call_started`
- `voice.call_completed`
- `voice.transfer_state_changed`

### SMS

- `sms.inbound_received`
- `sms.reply_generated`
- `sms.delivery_accepted`
- `sms.delivery_failed`

### Appointments

- `appointment.booked`
- `appointment.confirmation_notification_failed`

### Knowledge

- `knowledge.document_indexed`
- `knowledge.search_executed`

### Integrations

- `integration.calendar_connected`
- `integration.calendar_sync_failed`

### Workflows and snapshots

- `business.snapshot_refreshed`
- `workflow.failed`

## Correlation fields

Use these identifiers whenever they are available:

- `businessId`
- `conversationId`
- `callId`
- `messageId`
- `appointmentId`
- `channel`
- `provider`
- `model`

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

## AI traces

AI traces are emitted from the voice gateway with these PostHog event types:

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
