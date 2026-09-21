# Understand telemetry architecture

LobbyStack uses PostHog for product analytics and error tracking, and OpenTelemetry for server traces, metrics, and logs.

## Assign runtime ownership

- `apps/admin` browser code emits operator intent, navigation, and workflow outcomes.
- `apps/admin` server code traces HTTP, authentication, database, and provider operations.
- `apps/worker` emits job, outbox, provider, retry, and dead-letter telemetry.
- `apps/voice-gateway` emits call lifecycle, realtime, audio, transfer, and provider telemetry.
- `packages/telemetry` owns shared event names, redaction, trace propagation, and runtime-specific clients.

## Record durable events

Business outcomes are written through `recordProductEvent` to PostgreSQL after the authoritative operation commits. The worker's `telemetry.flush` job delivers pending rows to PostHog and retries failed delivery. A tenant-scoped `outbox.backlogSample` job samples each business's publishable outbox backlog every 60 seconds. Scheduler-created envelopes explicitly mark recurring work, whose ticks do not emit `workflow.started`; delayed event-driven jobs still emit starts, and recurring failures still emit `workflow.failed`. The hourly retention sweep deletes tenant-scoped sent product events older than seven days in indexed, lock-skipping batches. When one run reaches its batch cap, it schedules a bounded continuation through the transactional outbox until the fixed cutoff is drained, so cleanup converges without monopolizing one worker execution. In-process telemetry is reserved for diagnostics where loss during a crash is acceptable.

## Use one declared transport

`TELEMETRY_EVENT_TRANSPORT` is exhaustive and defines the permitted route for every registry event:

- `durable` — business outcomes from admin, domain, and worker code through `recordProductEvent`.
- `gateway` — realtime voice diagnostics through the gateway consent cache and PostHog client. This avoids database work on the audio hot path.
- `browser` — operator intent and navigation through `createBrowserTelemetry` and `useTelemetry`.

`$ai_generation` is intentionally allowed on both durable and gateway transports. Operational billing, outbox, and service events are durable; the `ops.*` prefix does not imply gateway ownership. Do not introduce another capture path. `pnpm telemetry:coverage` checks producer presence and transport ownership.

All three transports validate required properties. Development and self-hosted runtimes throw on invalid events. Cloud runtimes preserve customer data, report `telemetry.validation_failed`, and continue.

## Propagate traces

Admin, worker, and voice gateway requests propagate W3C trace context. Signed voice-backend requests include trace headers after signature material is calculated. Queue jobs retain correlation identifiers without storing customer content in telemetry fields.

## Privacy

Telemetry must not contain transcripts, message bodies, phone numbers, email addresses, uploaded filenames, signed URLs, access tokens, or provider credentials. Use the redaction helpers in `packages/telemetry` and stable internal identifiers for correlation.

## Product analytics and session replay

The landing page records sessions after cookie consent. The admin dashboard records operator sessions only when the active business has telemetry enabled, and never on authentication, prospect demo, or widget routes (`/login`, `/signup`, `/forgot-password`, `/reset-password/*`, `/confirm-email-change`, `/accept-invite`, `/claim-demo`, `/demo/*`, `/demos`, `/embed/*`). `ProductAnalytics` owns that decision; `apps/admin/instrumentation-client.ts` initializes the SDK opted out so nothing is collected before the decision is made.

Masking happens in the browser, because PostHog privacy controls run before data leaves the page and `before_send` cannot redact recorded payloads. Mask caller and contact text with the `ph-mask` class and block whole elements with `ph-no-capture` when an attribute carries personal data, such as the signed URL of a call recording or a contact's `title` tooltip. Both are honored by the SDK defaults.

Client analytics posts to the PostHog managed reverse proxy (`NEXT_PUBLIC_POSTHOG_HOST`), and the SDK `defaults` value is pinned to `2026-05-30` so later defaults tiers cannot silently enable session-replay network body capture.

## Collection

Server runtimes send traces, metrics, and logs to the OTLP base URL configured through `OTEL_EXPORTER_OTLP_ENDPOINT`. They attach headers from `OTEL_EXPORTER_OTLP_HEADERS` and sanitize telemetry before export. An empty endpoint disables server export. Browser events use the public PostHog key and host configured through `NEXT_PUBLIC_POSTHOG_*`.

## Validation

Run `pnpm telemetry:coverage`, `pnpm replacement:telemetry`, `pnpm replacement:privacy`, and the PostHog/OTel certification steps in `docs/validation/posthog-otel-validation.md` before production cutover.
