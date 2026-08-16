# Telemetry Architecture

LobbyStack uses PostHog for product analytics and error tracking, and OpenTelemetry for server traces, metrics, and logs.

## Runtime Ownership

- `apps/admin` browser code emits operator intent, navigation, and workflow outcomes.
- `apps/admin` server code traces HTTP, authentication, database, and provider operations.
- `apps/worker` emits job, outbox, provider, retry, and dead-letter telemetry.
- `apps/voice-gateway` emits call lifecycle, realtime, audio, transfer, and provider telemetry.
- `packages/telemetry` owns shared event names, redaction, trace propagation, and runtime-specific clients.

## Durable Events

Business events that must survive process failure are written to the PostgreSQL outbox in the same transaction as business state. The dispatcher publishes them asynchronously and records retries or dead-letter outcomes. In-process telemetry is reserved for diagnostics where loss during a crash is acceptable.

## Trace Propagation

Admin, worker, and voice gateway requests propagate W3C trace context. Signed voice-backend requests include trace headers after signature material is calculated. Queue jobs retain correlation identifiers without storing customer content in telemetry fields.

## Privacy

Telemetry must not contain transcripts, message bodies, phone numbers, email addresses, uploaded filenames, signed URLs, access tokens, or provider credentials. Use the redaction helpers in `packages/telemetry` and stable internal identifiers for correlation.

## Collection

Server runtimes export OTLP to the private OpenTelemetry Collector. The collector forwards traces, metrics, and logs to configured PostHog endpoints. Browser events use the public PostHog key and host configured through `NEXT_PUBLIC_POSTHOG_*`.

## Validation

Run `pnpm replacement:telemetry`, `pnpm replacement:privacy`, and the PostHog/OTel certification steps in `docs/validation/posthog-otel-validation.md` before production cutover.
