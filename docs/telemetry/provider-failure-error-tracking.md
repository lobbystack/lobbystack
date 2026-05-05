# Provider Failure Error Tracking

Handled external provider failures are reported to PostHog Error Tracking as `$exception` events. This covers runtime or customer-impacting failures from OpenAI, Google, Twilio, Polar, and Firecrawl.

## Notification To Configure In PostHog

Create Error Tracking notifications or internal destinations for alertable provider failures:

- Filter: `deploymentMode = cloud`, `alertable = true`, and `expected = false`
- Filter or break down by `provider`
- Notify immediately for `$exception_type` values:
  - `ProviderAuthFailedError`
  - `ProviderQuotaExhaustedError`
  - `ProviderUnavailableError`
- Add the issue spiking notification for repeated `providerErrorKind = rate_limited` issues
- Include properties in the notification: `provider`, `providerErrorKind`, `providerErrorCode`, `runtime`, `service`, `operation`, and `deploymentMode`
- Recommended primary destination: Discord

OpenAI credit exhaustion should appear with:

- `provider = openai`
- `providerErrorCode = insufficient_quota`
- `$exception_type = ProviderQuotaExhaustedError`

Firecrawl availability failures should appear with:

- `provider = firecrawl`
- `providerErrorKind = provider_unavailable` or `rate_limited`
- `runtime = convex`
- `service = convex`

## Notes

The code also keeps existing operational events such as `ops.voice.openai_realtime_error` for product analytics. Those events include provider classification metadata, but alerting should be based on Error Tracking exceptions.

Do not spend Product Analytics alert slots on provider failures when they already emit alertable `$exception` events. Reserve those slots for absence checks, especially missing Convex heartbeats, because Error Tracking cannot notify on an event that never arrived.

Do not add paid or destructive synthetic provider probes by default. Provider availability is detected from real app traffic, while app and voice liveness are covered by `ops.service.health_check`, `ops.convex.heartbeat`, and `ops.voice.heartbeat`.
