# Respond to critical alerts

Configure these conditions in your OTLP backend or infrastructure monitoring system. LobbyStack does not include a monitoring service.

## ReplacementOutboxDeadLettered

An outbox message exhausted ten delivery attempts. Query `operations.outbox_messages` for rows with `dead_lettered_at IS NOT NULL`, identify the topic and redacted error category, fix the provider or handler, then create a new idempotent outbox message. Do not clear the original row.

## ReplacementWorkerJobFailures

At least three BullMQ jobs failed within ten minutes. Inspect worker logs and BullMQ state by queue and job type. Confirm Redis and PostgreSQL health before retrying. Job payloads can contain customer data and must not be copied into incident systems.

## ReplacementOutboxDispatcherUnavailable

At least three PostgreSQL polling attempts failed within five minutes. Check the dispatcher database URL, `lobbystack_dispatcher` role, PostgreSQL readiness, connection limits, and network status. Pending durable work remains in PostgreSQL and should resume automatically after recovery.

## Test each alert

1. Submit a deliberately unsupported outbox topic and advance it to the terminal retry threshold. Confirm `ReplacementOutboxDeadLettered` activates without exposing its payload.
2. Interrupt Redis and PostgreSQL in a disposable environment. Confirm the worker and dispatcher alerts activate.
3. Restore each dependency and confirm the alerts resolve and durable processing resumes.
