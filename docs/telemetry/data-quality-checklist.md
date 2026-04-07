# Analytics Data Quality Checklist

Use this checklist whenever a new product or domain event is added, renamed, or moved between runtimes.

## Contract checks

- confirm the event name exists in `packages/telemetry/src/index.ts`
- confirm the event has required properties listed in `TELEMETRY_REQUIRED_PROPERTIES_BY_EVENT`
- confirm the event includes `deploymentMode`
- confirm `businessId` is present whenever the event belongs to a business context
- confirm correlation IDs are included when available:
  - `conversationId`
  - `callId`
  - `messageId`
  - `appointmentId`

## Privacy checks

- confirm raw SMS bodies are not sent
- confirm transcript text is not sent
- confirm prompt text is not sent
- confirm customer names and phone numbers are redacted
- confirm new nested payload fields still pass through shared redaction helpers

## Runtime ownership checks

- confirm `apps/web` owns operator-intent events only
- confirm `convex` owns business outcome events
- confirm `apps/voice-gateway` owns runtime observability and AI trace events
- avoid duplicate emission unless analytics specifically needs two perspectives

## PostHog checks

- confirm the event appears in PostHog `Activity`
- confirm the event is grouped under the `business` group when `businessId` is present
- confirm any related action, funnel, or dashboard tile still resolves after the change
- confirm Safari and Chrome both ingest browser events when using the first-party proxy

## Dashboard checks

- if the event feeds a KPI, update the saved insight or dashboard that owns it
- if the event changes funnel semantics, update `docs/telemetry/kpi-spec.md`
- if the event is critical to telemetry trust, add or update validation steps in `docs/validation/posthog-otel-validation.md`

## Outbox checks

- for Convex events, verify rows land in `telemetry_outbox`
- confirm successful rows move to `delivered`
- confirm failure rows increment `attemptCount`
- confirm backlog monitoring still reflects the new event volume

## Alerting checks

- decide whether the event belongs in analytics health monitoring
- if yes, update alert thresholds or runbooks for:
  - volume drops
  - spikes in failures
  - outbox backlog growth

## Review habit

Before closing analytics work:

- inspect the raw event in PostHog
- inspect the dashboard or insight that should consume it
- add a short verification note to the Linear issue
