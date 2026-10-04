# Configure error tracking alerts

The admin app reports unexpected server errors to PostHog Error Tracking as `$exception` events. Each event carries `service = lobbystack-admin`, `alertable = true`, the failing `operation`, `environment`, and `release`, plus `route` and `method` when a request failed. Failures from OpenAI, Google, Twilio, Polar, or Firecrawl reach Error Tracking the same way when they surface as server errors. The app doesn't tag them by provider.

## Configure the PostHog notification

Create an Error Tracking notification for alertable admin errors:

- Filter: `service = lobbystack-admin` and `alertable = true`
- Notify on new issues, and add the issue spiking notification for repeated failures
- Include `operation`, `route`, `environment`, and `release` in the notification
- Recommended destination: Discord

## Notes

Keep Product Analytics alert slots for absence checks, such as missing worker heartbeats. Error Tracking can't notify on an event that never arrived, so those checks need Product Analytics.

Skip paid or destructive synthetic provider probes. Real application traffic shows whether providers respond, and `ops.service.health_check` and `ops.voice.heartbeat` cover application and voice liveness.
