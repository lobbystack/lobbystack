# PostHog + OTel Validation

## Goal

Validate that:

- web product events reach PostHog
- Convex domain events reach PostHog through the outbox
- voice-gateway traces and metrics reach Grafana Cloud through OTLP
- AI traces reach PostHog without leaking sensitive content

## Required environment

### Web / app

- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

### Convex / voice gateway

- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`

Set `DEPLOYMENT_MODE=cloud` for provider validation runs.

## Web validation

1. Sign in through the operator UI.
2. Visit `/`, `/calls`, `/messages`, `/analytics`, `/agent`, and `/settings`.
3. Complete one onboarding step, one knowledge upload, and one calendar connect flow.
4. Verify these events in PostHog:
   - `web.auth.login_succeeded`
   - `web.page.*`
   - `web.onboarding.*`
   - `web.knowledge.upload_*`
   - `web.integration.calendar_connect_*`

## Convex validation

1. Place or simulate a voice call.
2. Send an inbound SMS and trigger an automated reply.
3. Book an appointment.
4. Trigger a calendar sync failure scenario if possible.
5. Verify these domain events in PostHog:
   - `voice.call_started`
   - `voice.call_completed`
   - `sms.inbound_received`
   - `sms.reply_generated`
   - `sms.delivery_accepted`
   - `appointment.booked`
   - `integration.calendar_connected`
   - `integration.calendar_sync_failed`
   - `knowledge.document_indexed`
   - `knowledge.search_executed`

## Voice gateway validation

1. Start a live call through Twilio.
2. Confirm OTLP ingestion in Grafana Cloud for service `ai-receptionist-voice-gateway`.
3. Validate traces or metrics for:
   - active calls
   - snapshot cache hit or miss
   - OpenAI turn latency
   - tool execution latency
   - media stream disconnects

## AI trace validation

1. Run a live call that produces at least one assistant turn and one tool call.
2. Verify PostHog receives:
   - `$ai_trace`
   - `$ai_generation`
   - `$ai_span`
3. Confirm the payload includes:
   - trace ID
   - model
   - provider
   - latency
   - tool name or tool invocation state
4. Confirm the payload does not include:
   - transcript text
   - SMS body text
   - prompt text
   - customer name
   - customer phone number

## Outbox validation

1. Query the `telemetry_outbox` table after emitting domain events.
2. Confirm rows are inserted as `pending`.
3. Confirm successful delivery moves rows to `delivered`.
4. Confirm provider failures increase `attemptCount` and push `availableAt` forward.

## Current local verification

These checks were completed in code during implementation:

- `pnpm --filter @ai-receptionist/telemetry test`
- `pnpm exec convex codegen`
- `pnpm typecheck`

Provider validation in real PostHog and Grafana Cloud still requires live credentials and runtime traffic.
