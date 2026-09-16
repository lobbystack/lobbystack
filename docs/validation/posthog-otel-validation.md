# Validate PostHog and OpenTelemetry

Run `pnpm replacement:telemetry` to verify correlated traces, metrics, logs, headers, redaction, and exporter-outage behavior against a temporary local OTLP receiver.

In staging, confirm admin, worker, voice gateway, and migrator emit the expected `service.name`, deployed `service.version`, and environment attributes. Inspect request-to-outbox-to-job-to-provider propagation and admin-to-voice propagation using the W3C trace ID.

Search exported telemetry for transcript text, message bodies, prompts and model responses, phone numbers, complete email addresses, credentials, session or OAuth tokens, signed URLs, SQL bind values, and object keys. Any match fails certification.

Block the configured OTLP endpoint while serving requests. Business requests and durable work must continue. Restore the endpoint and confirm that new signals export. With product telemetry opted out, product events and session replay stop while minimal availability and security telemetry remains.

For product and AI analytics, inspect a consented dashboard session and one widget or voice generation in PostHog Activity:

- dashboard events identify the operator as `user:{userId}` and include `$groups.business: business:{businessId}`; switch workspaces and confirm the next event uses the new group, then sign out and confirm a subsequent session does not retain the earlier identity;
- durable AI generations identify as `system:business:{businessId}`, include the same business group, and populate `$ai_trace_id` and `$ai_session_id` from the conversation, call, or background trace;
- force a safe widget provider failure and confirm `$ai_is_error: true` with the fixed failure category, never a provider error message, prompt, transcript, or response body.

The product has a versioned catalog for `gpt-realtime-2.1` using OpenAI's published text/audio rates. Each durable priced record stores the rate version, effective date, source URL, token breakdown, and applied rates. Other models require matching `OPENAI_REALTIME_*_TOKEN_PRICE_USD` secrets. Missing prices remain unknown and are never reported as zero. The durable usage ledger is independent of product-analytics consent.

Input-audio transcription latency is emitted only when Realtime's committed item ID is later present on the completed transcription event. Events without that stable item correlation intentionally omit latency. Transcription cost remains unknown unless its matching configured rate is present.

The optional finance export is disabled unless `FINANCE_EXPORT_ENABLED=true`. It requires a separate `FINANCE_EXPORT_TOKEN` bearer token and a `LOBBYSTACK_FINANCE_EXPORT_DATABASE_URL` for the read-only `lobbystack_finance_export` role. It does not accept the general internal-service credentials. Its versioned resources (`usage`, `businesses`, `service-periods`, `metrics`) use `(updatedAt, id)` cursors; consumers should retain the opaque cursor and continue to rescan a recent metrics window because daily aggregates can be revised.
