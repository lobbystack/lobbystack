# PostHog Validation

## Goal

Validate that:

- web product events reach PostHog
- Convex domain events reach PostHog through the outbox
- voice-gateway operational logs and health events reach PostHog
- AI traces reach PostHog without leaking sensitive content
- alertable production failures notify through PostHog-backed Discord and email destinations

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
- `APP_BASE_URL`
- `VOICE_GATEWAY_BASE_URL`

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
   - trigger one render error and confirm it appears with `runtime = web`, `service = web`, `operation = react_caught_error`, `alertable = true`, and `expected = false`
   - trigger one rejected Convex mutation or action from the UI and confirm it appears with `runtime = web`, `convexFunctionType`, and `convexFunction`
   - trigger one handled technical failure path such as a calendar connect error or knowledge upload error and confirm it appears with `runtime = web`
8. Validate browser source maps:
   - deploy the built web assets after running `pnpm build` and `pnpm --filter @lobbystack/web posthog:sourcemaps`
   - confirm production deploys fail or are review-blocked when `POSTHOG_CLI_API_KEY` or `POSTHOG_CLI_PROJECT_ID` is missing
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
7. Verify service health events in PostHog:
   - `ops.service.health_check` for `service = web`
   - `ops.service.health_check` for `service = voice-gateway`
   - one `ops.service.health_check_failed` when a target returns non-2xx, times out, or has missing config
   - one matching `$exception` with `operation = service_health_check`, `runtime = convex`, and `alertable = true`
8. Trigger one failing observed Convex action or HTTP action and confirm the `$exception` event includes `runtime = convex`, `service = convex`, `operation`, `alertable = true`, and `$exception_list`.

## Voice gateway validation

1. Start a live call through Twilio.
2. Validate PostHog Error Tracking for the gateway:
   - confirm a startup or request-path failure appears with `runtime = voice-gateway`
   - confirm a provider recovery failure or call record initialization failure appears with `channel = voice` and `provider = twilio`
   - trigger one fatal `unhandledRejection` or `uncaughtException` in a non-production validation deployment and confirm PostHog receives a fatal exception before the process exits
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

- `LobbyStack - Runtime Health`
- `LobbyStack - Voice Gateway Operations`
- `LobbyStack - AI Runtime`
- `LobbyStack - Telemetry Delivery Health`

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

Validate these Error Tracking notifications in PostHog:

- create an Error Tracking notification or internal destination for issue created events
- create an Error Tracking notification or internal destination for issue reopened events
- optionally create an Error Tracking notification or internal destination for issue spiking events
- use the Discord destination for the primary "prod broke" channel
- add email only where the active PostHog plan and destination type support it
- filter or route to `deploymentMode = cloud`, `alertable = true`, and `expected = false` where the notification editor supports filtering
- verify one alertable `$exception` from each critical surface reaches the notification destination:
  - browser render/runtime crash
  - rejected observed Convex action or mutation
  - observed Convex action, mutation, or HTTP action failure
  - voice-gateway request or fatal runtime failure
  - service health check failure
  - alertable provider exception for `provider = firecrawl`, `openai`, `twilio`, `polar`, or `google`

PostHog Error Tracking notifications are separate from Product Analytics Alerts. Use Product Analytics Alerts only for signals that Error Tracking cannot infer from an exception issue, especially absence-based checks:

- no `ops.convex.heartbeat` over a 10-minute window
- optionally no `ops.voice.heartbeat` for the expected interval when the plan has room for a second alert

Health-check and provider failures emit alertable `$exception` events, so they should page through Error Tracking notifications instead of consuming Product Analytics alert slots. The heartbeat absence checks are the main remaining reason to use Product Analytics Alerts.

## Outbox validation

1. Query the `telemetry_outbox` table after emitting domain events.
2. Confirm rows are inserted as `pending`.
3. Confirm successful delivery moves rows to `delivered`.
4. Confirm provider failures increase `attemptCount` and push `availableAt` forward.

## Current local verification

These checks should be run before review:

- `pnpm --filter @lobbystack/telemetry test`
- `pnpm --filter @lobbystack/web typecheck`
- `pnpm --filter @lobbystack/web test`
- `pnpm --filter @lobbystack/voice-gateway typecheck`
- `pnpm --filter @lobbystack/voice-gateway test`
- `pnpm typecheck:convex`
- `pnpm test:convex`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

Provider validation in real PostHog still requires live credentials and runtime traffic.
