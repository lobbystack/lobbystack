# Provider Failure Error Tracking

Handled external provider failures are reported to PostHog Error Tracking as `$exception` events. This covers runtime or customer-impacting failures from OpenAI, Google, Twilio, Polar, and Firecrawl while keeping app/operator notifications out of v1.

## Alert To Configure In PostHog

Create an Error Tracking alert for quota exhaustion:

- Filter: `$exception_type` contains `ProviderQuotaExhaustedError`
- Include properties in the notification: `provider`, `providerErrorCode`, `runtime`, and `deploymentMode`
- Recommended destination: PostHog email or Slack alert

OpenAI credit exhaustion should appear with:

- `provider = openai`
- `providerErrorCode = insufficient_quota`
- `$exception_type = ProviderQuotaExhaustedError`

## Notes

The code also keeps existing operational events such as `ops.voice.openai_realtime_error` for product analytics. Those events include provider classification metadata, but alerting should be based on Error Tracking exceptions.
