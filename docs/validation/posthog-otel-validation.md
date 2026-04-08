# PostHog Validation

## Goal

Validate that:

- web product events reach PostHog
- Convex domain events reach PostHog through the outbox
- voice-gateway operational logs and health events reach PostHog
- AI traces reach PostHog without leaking sensitive content

## Required environment

### Web / app

- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_POSTHOG_UI_HOST`
- `POSTHOG_CLI_API_KEY`
- `POSTHOG_CLI_PROJECT_ID`
- `POSTHOG_CLI_HOST` if you are not on the US PostHog Cloud host
- `POSTHOG_RELEASE_NAME` and `POSTHOG_RELEASE_VERSION` if you want to override the default release metadata

### Convex / voice gateway

- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `POSTHOG_PRIVACY_MODE=true`

Set `DEPLOYMENT_MODE=cloud` for provider validation runs.

## Web validation

1. Sign in through the operator UI.
2. Visit `/`, `/calls`, `/messages`, `/analytics`, `/agent`, and `/settings`.
3. Complete one onboarding step, one knowledge upload, and one calendar connect flow.
4. Verify these events in PostHog:
   - `$pageview`
   - `$pageleave`
   - `web.auth.login_succeeded`
   - `web.page.*`
   - `web.contacts.contact_opened`
   - `web.messages.thread_opened`
   - `web.messages.reply_sent`
   - `web.agent.settings_saved`
   - `web.onboarding.*`
   - `web.knowledge.upload_*`
   - `web.integration.calendar_connect_*`
5. Confirm session replay still appears for the session.
6. Confirm the PostHog `Web analytics` product shows route traffic for the tested pages.
7. Validate browser error tracking:
   - trigger one unhandled error in the browser console and confirm it appears in PostHog Error Tracking
   - trigger one unhandled rejection and confirm it appears in PostHog Error Tracking
   - trigger one handled technical failure path such as a calendar connect error or knowledge upload error and confirm it appears with `runtime = web`
8. Validate browser source maps:
   - deploy with `pnpm --filter @ai-receptionist/web deploy:cloudflare` or `preview:cloudflare`
   - confirm the matching release exists in PostHog symbol sets
   - confirm browser stack traces resolve to source files instead of minified bundles

## Convex validation

1. Place or simulate a voice call.
2. Send an inbound SMS and trigger an automated reply.
3. Book an appointment.
4. Trigger a calendar sync failure scenario if possible.
5. Verify these domain events in PostHog:
   - `voice.call_started`
   - `voice.call_completed`
   - `voice.transfer_requested`
   - `voice.transfer_completed`
   - `sms.inbound_received`
   - `sms.reply_generated`
   - `sms.delivery_accepted`
   - `sms.automation_paused`
   - `appointment.booked`
   - `appointment.booking_failed`
   - `integration.calendar_connected`
   - `integration.calendar_sync_failed`
   - `knowledge.document_indexed`
   - `knowledge.search_executed`
   - `workflow.started`
   - `workflow.failed`
6. Verify operational delivery events in PostHog:
   - `ops.convex.heartbeat`
   - `ops.convex.outbox_backlog_sample`
   - `ops.convex.outbox_flush_failed` when retrying rows exist

## Voice gateway validation

1. Start a live call through Twilio.
2. Validate PostHog Error Tracking for the gateway:
   - confirm a startup or request-path failure appears with `runtime = voice-gateway`
   - confirm a provider recovery failure or call record initialization failure appears with `channel = voice` and `provider = twilio`
3. Validate PostHog operational events for:
   - `ops.voice.heartbeat`
   - `ops.voice.invalid_signature`
   - `ops.voice.media_disconnect`
   - `ops.voice.snapshot_cache_hit`
   - `ops.voice.snapshot_cache_miss`
   - `ops.voice.openai_realtime_error`
   - `ops.voice.turn_completed`
   - `ops.voice.turn_slow`
   - `ops.voice.tool_completed`
   - `ops.voice.tool_failed`
   - `ops.voice.recording_upload_failed`
4. Validate PostHog Logs for the gateway:
   - confirm log records are present for heartbeat, invalid signatures, media disconnects, OpenAI realtime failures, slow turns, tool failures, and recording upload failures
   - confirm log records remain searchable by `businessId`, `callId`, `conversationId`, `provider`, and `toolName` when those identifiers exist

## AI trace validation

1. Run a live call that produces at least one assistant turn and one tool call.
2. Run one non-realtime Gemini generation from the SMS assistant or dashboard knowledge preview.
3. Trigger one knowledge search or indexing operation so embedding telemetry is emitted.
4. Verify PostHog receives:
   - `$ai_trace`
   - `$ai_generation`
   - `$ai_span`
   - `ai.embedding.completed`
5. Confirm the payload includes:
   - trace ID
   - model
   - provider
   - latency
   - time to first token for streaming voice generations
   - token counts when the provider returns them
   - tool name or tool invocation state
6. Confirm the payload does not include:
   - `$ai_input`
   - `$ai_output_choices`
   - transcript text
   - SMS body text
   - prompt text
   - assistant output text
   - customer name
   - customer phone number
   - tool input or tool output content
7. For non-realtime Gemini generations, confirm the payload still includes provider/model/latency metadata even though prompt and output text are absent.
8. For embedding telemetry, confirm the payload includes only metadata such as operation name, provider/model, input size, latency, and result count.

## Dashboard and alert validation

Validate these runtime dashboards:

- `AI Receptionist - Runtime Health`
- `AI Receptionist - Voice Gateway Operations`
- `AI Receptionist - AI Runtime`
- `AI Receptionist - Telemetry Delivery Health`

Each dashboard should load from saved trend or SQL insights without ad hoc query edits.

Validate these runtime insights:

- call starts versus completions
- OpenAI realtime errors
- slow turn volume
- tool failure volume
- invalid signature volume
- media disconnect volume
- outbox backlog samples
- outbox flush failures
- workflow failures
- calendar sync failures
- booking failures

Validate these alert policies in PostHog:

- no `ops.voice.heartbeat` for the interval
- spike in `ops.voice.openai_realtime_error`
- spike in `ops.voice.turn_slow`
- spike in `ops.voice.tool_failed`
- drop in `voice.call_started`
- spike in `appointment.booking_failed`
- spike in `workflow.failed`
- spike in `integration.calendar_sync_failed`
- sustained `ops.convex.outbox_backlog_sample` with `backlogBucket = critical`

## Outbox validation

1. Query the `telemetry_outbox` table after emitting domain events.
2. Confirm rows are inserted as `pending`.
3. Confirm successful delivery moves rows to `delivered`.
4. Confirm provider failures increase `attemptCount` and push `availableAt` forward.

## Current local verification

These checks should be run before review:

- `pnpm --filter @ai-receptionist/telemetry test`
- `pnpm --filter @ai-receptionist/web typecheck`
- `pnpm --filter @ai-receptionist/voice-gateway typecheck`
- `pnpm typecheck:convex`

Provider validation in real PostHog still requires live credentials and runtime traffic.
