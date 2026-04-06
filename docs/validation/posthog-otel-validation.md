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
- `VITE_POSTHOG_UI_HOST`

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
6. Confirm the PostHog `Web analytics` product now shows route traffic for the tested pages.
7. In Safari, validate again with:
   - the managed reverse proxy host `https://t.nontia.com` enabled as `VITE_POSTHOG_HOST`
   - content blockers disabled and then re-enabled if you are testing the proxy hardening

If the managed proxy ever needs to be rolled back temporarily, switch `VITE_POSTHOG_HOST` to `https://us.i.posthog.com` and keep `VITE_POSTHOG_UI_HOST=https://us.posthog.com`.

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

## KPI dashboard validation

Validate these hosted dashboards:

- `AI Receptionist - Product KPIs`
- `AI Receptionist - Operator Workflow`
- `AI Receptionist - Messaging`
- `AI Receptionist - Voice & Booking Outcomes`
- `AI Receptionist - Analytics Health`

Each dashboard should have at least one saved insight behind it and should load without ad hoc query edits.

Validate these saved insights:

- `KPI - Onboarding Activation Funnel`
- `KPI - SMS Adoption Funnel`
- `KPI - Voice Booking Funnel`
- `KPI - Booking Success vs Failure`
- `KPI - Calendar Integration Health`
- `KPI - Workflow Health`
- `KPI - Meaningful Usage by Business`
- `KPI - Analytics Critical Event Volume`

Validate group analytics behavior:

- events with `businessId` should also resolve under the `business` PostHog group
- `KPI - Meaningful Usage by Business` should show grouped usage by `businessId`
- onboarding and booking insights should remain sliceable at the business level

Validate the first meaningful usage action:

- `Meaningful First Usage` should match at least one of:
  - `web.messages.thread_opened`
  - `web.messages.reply_sent`
  - `web.contacts.contact_opened`
  - `web.agent.settings_saved`
- the onboarding KPI funnel should include the action as its final step

## Analytics health validation

Validate the analytics health dashboard covers:

- `web.auth.login_succeeded` volume
- `sms.inbound_received` volume
- `voice.call_started` volume
- `appointment.booked` volume
- failure events via `Telemetry - Delivery and Workflow Failures`
- workflow starts versus failures
- calendar connections versus sync failures

Alert policies should be configured manually in PostHog or the owning incident tool for:

- sudden drop in `web.auth.login_succeeded`
- sudden drop in `sms.inbound_received`
- sudden drop in `voice.call_started`
- sudden drop in `appointment.booked`
- spike in `appointment.booking_failed`
- spike in `workflow.failed`
- spike in `integration.calendar_sync_failed`
- backlog growth in `telemetry_outbox`

## Outbox validation

1. Query the `telemetry_outbox` table after emitting domain events.
2. Confirm rows are inserted as `pending`.
3. Confirm successful delivery moves rows to `delivered`.
4. Confirm provider failures increase `attemptCount` and push `availableAt` forward.

## Current local verification

These checks were completed in code during implementation:

- `pnpm --filter @ai-receptionist/telemetry test`
- `pnpm --filter @ai-receptionist/web typecheck`
- `pnpm typecheck:convex`

Provider validation in real PostHog and Grafana Cloud still requires live credentials and runtime traffic.
