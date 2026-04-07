# Event Taxonomy

## Ownership

- `apps/web` emits operator intent and workflow events
- `convex` emits authoritative business outcome events
- `apps/voice-gateway` emits runtime observability and AI trace events

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
- `web.onboarding.verify_phone_started`
- `web.onboarding.verify_phone_completed`
- `web.onboarding.number_claim_started`
- `web.onboarding.number_claim_completed`
- `web.knowledge.upload_started`
- `web.knowledge.upload_completed`
- `web.knowledge.preview_answer_requested`
- `web.integration.calendar_connect_started`
- `web.integration.calendar_connect_completed`
- `web.integration.calendar_connect_failed`
- `web.integration.calendar_disconnect_completed`
- `web.voice.follow_up_completed`

### Voice events

- `voice.call_started`
- `voice.call_completed`
- `voice.transfer_state_changed`
- `voice.transfer_requested`
- `voice.transfer_completed`
- `voice.snapshot_loaded`
- `voice.tool_invoked`

### SMS events

- `sms.inbound_received`
- `sms.reply_generated`
- `sms.delivery_accepted`
- `sms.delivery_failed`
- `sms.automation_paused`

### Appointment events

- `appointment.booked`
- `appointment.booking_failed`
- `appointment.confirmation_notification_failed`

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
- calendar disconnects: `provider`, `staffId`
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

### Voice events

Always include:

- `businessId`
- `deploymentMode`
- `callId`
- `provider`

Add when available:

- `conversationId`
- `channel`
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

Add when staff-scoped:

- `staffId`

### Workflow events

Always include:

- `businessId`
- `deploymentMode`
- `workflowName`

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
