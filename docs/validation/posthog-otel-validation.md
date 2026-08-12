# PostHog and OpenTelemetry Validation

Run `pnpm replacement:telemetry` to verify correlated traces, metrics, logs, redaction, and exporter-outage behavior against the local certification collector.

In staging, confirm admin, worker, voice gateway, and migrator emit the expected `service.name`, deployed `service.version`, and environment attributes. Inspect request-to-outbox-to-job-to-provider propagation and admin-to-voice propagation using the W3C trace ID.

Search exported telemetry for transcript text, message bodies, prompts and model responses, phone numbers, complete email addresses, credentials, session or OAuth tokens, signed URLs, SQL bind values, and object keys. Any match fails certification.

Stop and restart the collector while serving requests. Business requests and durable work must continue, memory must remain bounded, and new signals must export after recovery. With product telemetry opted out, product events and session replay stop while minimal availability and security telemetry remains.
