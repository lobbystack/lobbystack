# Critical Alerts

Prometheus evaluates the replacement platform rules in `docker/prometheus/rules/alerts.yml`. Route these alerts through the environment's managed Alertmanager or equivalent paging integration; the local Compose profile intentionally only evaluates and displays alerts.

Run `docker compose --env-file .env.replacement -f docker-compose.replacement.yml --profile observability up -d prometheus` and inspect `http://localhost:9090/alerts`. CI validates the configuration and executes `promtool test rules` against deterministic fixtures.

## ReplacementCollectorUnavailable

The collector metrics endpoint has been unreachable for two minutes. Confirm `/health`, container status, memory pressure, and recent collector logs. Product traffic must continue while telemetry is unavailable. Restart the collector only after preserving relevant logs.

## ReplacementOutboxDeadLettered

An outbox message exhausted ten delivery attempts. Query `operations.outbox_messages` for rows with `dead_lettered_at IS NOT NULL`, identify the topic and redacted error category, fix the provider or handler, then create a new idempotent outbox message. Do not clear the original row.

## ReplacementWorkerJobFailures

At least three BullMQ jobs failed within ten minutes. Inspect worker logs and BullMQ state by queue and job type. Confirm Redis and PostgreSQL health before retrying. Job payloads can contain customer data and must not be copied into incident systems.

## ReplacementOutboxDispatcherUnavailable

At least three PostgreSQL polling attempts failed within five minutes. Check the dispatcher database URL, `lobbystack_dispatcher` role, PostgreSQL readiness, connection limits, and network status. Pending durable work remains in PostgreSQL and should resume automatically after recovery.

## Test Procedure

1. Run the Prometheus rule tests.
2. In a disposable environment, stop the collector for more than two minutes and confirm `ReplacementCollectorUnavailable` becomes active.
3. Submit a deliberately unsupported outbox topic and advance it to the terminal retry threshold; confirm `ReplacementOutboxDeadLettered` becomes active without exposing its payload.
4. Restore each dependency and confirm the availability alerts resolve and durable processing resumes.
