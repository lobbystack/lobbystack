#!/bin/sh
# OpenTelemetry Collector entrypoint.
#
# Generates the collector configuration and starts the collector with it.
# PostHog OTLP export is enabled only when both POSTHOG_OTLP_ENDPOINT and
# POSTHOG_API_KEY are configured, so the collector always starts even when
# telemetry destinations are unavailable.
set -eu

mkdir -p /etc/otelcol-contrib

cat > /etc/otelcol-contrib/generated.yaml <<'YAML'
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 256
    spike_limit_mib: 64
  attributes/redaction:
    actions:
      - key: db.statement
        action: delete
      - key: http.request.body
        action: delete
      - key: http.response.body
        action: delete
      - key: gen_ai.prompt
        action: delete
      - key: gen_ai.completion
        action: delete
  tail_sampling:
    decision_wait: 10s
    num_traces: 10000
    expected_new_traces_per_sec: 50
    policies:
      - name: keep-failed-traces
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: keep-slow-traces
        type: latency
        latency:
          threshold_ms: 2000
      - name: keep-voice-traces
        type: string_attribute
        string_attribute:
          key: lobbystack.domain
          values: [voice]
      - name: sample-successful-traces
        type: probabilistic
        probabilistic:
          sampling_percentage: 20
  batch:
    send_batch_size: 512
    timeout: 2s

exporters:
  debug:
    verbosity: basic
  prometheus:
    endpoint: 0.0.0.0:8889
YAML

if [ -n "${POSTHOG_OTLP_ENDPOINT:-}" ] && [ -n "${POSTHOG_API_KEY:-}" ]; then
  cat >> /etc/otelcol-contrib/generated.yaml <<YAML
  otlphttp/posthog:
    endpoint: "${POSTHOG_OTLP_ENDPOINT}"
    headers:
      Authorization: "Bearer ${POSTHOG_API_KEY}"
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 60s
      max_elapsed_time: 120s
    sending_queue:
      enabled: true
      queue_size: 5000
      block_on_overflow: false
YAML
  posthog_exporters=", otlphttp/posthog"
else
  posthog_exporters=""
fi

cat >> /etc/otelcol-contrib/generated.yaml <<YAML

extensions:
  health_check:
    endpoint: 0.0.0.0:13133

service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, attributes/redaction, tail_sampling, batch]
      exporters: [debug${posthog_exporters}]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, debug]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, attributes/redaction, batch]
      exporters: [debug${posthog_exporters}]
YAML

exec /otelcol-contrib --config /etc/otelcol-contrib/generated.yaml
