# Telemetry Architecture

## Overview

This repository uses a two-destination telemetry architecture:

- `PostHog` for operator product analytics and AI trace analytics
- `OpenTelemetry -> Grafana Cloud` for backend traces, metrics, and logs from the voice gateway

The split is intentional:

- `apps/web` owns operator intent and product workflow events
- `convex` owns authoritative business outcome events
- `apps/voice-gateway` owns runtime observability and redacted AI trace analytics

## Privacy rules

These values must not leave the system through external telemetry by default:

- raw transcripts
- SMS bodies
- prompt text
- customer names
- phone numbers
- recording URLs

Redaction is enforced in shared telemetry helpers for:

- PostHog event properties
- AI trace properties
- OpenTelemetry attributes

Audit data remains first-party only in `convex.audit_logs`.

## PostHog

### Identity model

- operator/browser analytics use `distinct_id = user:{userId}`
- server-side business analytics use `distinct_id = system:business:{businessId}`
- PostHog group key uses `business:{businessId}`
- customers are never modeled as PostHog persons

### `apps/web`

The web app initializes PostHog in `apps/web/src/main.tsx` with:

- `autocapture: false`
- `capture_pageview: false`
- `disable_session_recording: true`

Page views are tracked manually from route changes in `apps/web/src/App.tsx`.
Operator actions are captured from feature entry points such as auth, onboarding, calendar setup, knowledge uploads, and follow-up completion.

### `convex`

Convex writes PostHog-bound events to `telemetry_outbox` and flushes them through `convex/telemetry/posthog.ts`.

Key properties of the outbox:

- non-blocking delivery from business logic
- retry with backoff
- no direct vendor calls from mutations
- disabled automatically outside cloud mode unless telemetry env vars are set

### Domain events currently emitted

- `voice.call_started`
- `voice.call_completed`
- `voice.transfer_state_changed`
- `sms.inbound_received`
- `sms.reply_generated`
- `sms.delivery_accepted`
- `sms.delivery_failed`
- `appointment.booked`
- `integration.calendar_connected`
- `integration.calendar_sync_failed`
- `knowledge.document_indexed`
- `knowledge.search_executed`
- `business.snapshot_refreshed`

## OpenTelemetry

`apps/voice-gateway` exports OpenTelemetry data to OTLP using `apps/voice-gateway/src/observability/otel.ts`.

Current service resource attributes:

- `service.name = ai-receptionist-voice-gateway`
- `service.namespace = ai-receptionist`
- `deployment.environment = DEPLOYMENT_MODE`

### Gateway instrumentation

The voice gateway currently emits:

- auto-instrumented HTTP/runtime spans through the Node SDK
- manual spans around Convex runtime calls and tool execution
- metrics for:
  - active calls
  - invalid Twilio signatures
  - media stream disconnects
  - snapshot cache hits and misses
  - OpenAI Realtime errors
  - assistant turn latency
  - tool execution latency and failures
  - recording upload failures

Structured gateway logs should continue to include operational identifiers like:

- `businessId`
- `callId`
- `conversationId`
- `provider`
- `toolName`

## AI traces in PostHog

The live voice runtime emits redacted PostHog AI analytics events through `apps/voice-gateway/src/observability/posthog.ts`.

Current event model:

- `$ai_trace` when a live OpenAI session is configured
- `$ai_generation` when a response turn completes
- `$ai_span` for tool call execution

Only redacted metadata is sent, such as:

- model
- provider
- latency
- error status
- tool names
- transfer invocation state

## Environment variables

### Browser

- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

### Server and voice gateway

- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_TRACE_SAMPLE_RATIO`

Telemetry export is only enabled automatically in `cloud` deployment mode.
