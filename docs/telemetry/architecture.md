# Understand telemetry architecture

LobbyStack uses PostHog for product analytics and error tracking, and OpenTelemetry for server traces, metrics, and logs.

## Assign runtime ownership

- `apps/admin` browser code emits operator intent, navigation, and workflow outcomes.
- `apps/admin` server code traces HTTP, authentication, database, and provider operations.
- `apps/worker` emits job, outbox, provider, retry, and dead-letter telemetry.
- `apps/voice-gateway` emits call lifecycle, realtime, audio, transfer, and provider telemetry.
- `packages/telemetry` owns shared event names, redaction, trace propagation, and runtime-specific clients.

## Record durable events

Business events that must survive process failure are written to the PostgreSQL outbox in the same transaction as business state. The dispatcher publishes them asynchronously and records retries or dead-letter outcomes. In-process telemetry is reserved for diagnostics where loss during a crash is acceptable.

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

Run `pnpm replacement:telemetry`, `pnpm replacement:privacy`, and the PostHog/OTel certification steps in `docs/validation/posthog-otel-validation.md` before production cutover.
