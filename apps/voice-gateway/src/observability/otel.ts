import {
  metrics,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

import { loadVoiceGatewayEnv } from "@ai-receptionist/config";
import { redactOtelAttributes } from "@ai-receptionist/telemetry";

let sdk: NodeSDK | null = null;

function parseOtlpHeaders(
  headerString: string | undefined,
): Record<string, string> | undefined {
  if (!headerString) {
    return undefined;
  }

  const entries = headerString
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex < 0) {
        return null;
      }
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!key || !value) {
        return null;
      }
      return [key, value] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function getExporterConfig() {
  const env = loadVoiceGatewayEnv(process.env);
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return null;
  }

  return {
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    sampleRatio: env.OTEL_TRACE_SAMPLE_RATIO,
    deploymentMode: env.DEPLOYMENT_MODE,
  };
}

function buildExporterOptions(
  endpoint: string,
  headers?: Record<string, string>,
): { url: string; headers?: Record<string, string> } {
  return headers ? { url: endpoint, headers } : { url: endpoint };
}

export const tracer = trace.getTracer("ai-receptionist.voice-gateway");
export const meter = metrics.getMeter("ai-receptionist.voice-gateway");

const activeCallsCounter = meter.createUpDownCounter("voice_gateway.active_calls", {
  description: "Number of currently active live voice sessions.",
});
const invalidSignatureCounter = meter.createCounter(
  "voice_gateway.twilio_invalid_signature_total",
  {
    description: "Number of rejected Twilio requests with invalid signatures.",
  },
);
const mediaDisconnectCounter = meter.createCounter(
  "voice_gateway.media_stream_disconnect_total",
  {
    description: "Number of Twilio media stream websocket disconnects.",
  },
);
const snapshotCacheHitCounter = meter.createCounter(
  "voice_gateway.snapshot_cache_hit_total",
  {
    description: "Number of snapshot cache hits before starting a live call.",
  },
);
const snapshotCacheMissCounter = meter.createCounter(
  "voice_gateway.snapshot_cache_miss_total",
  {
    description: "Number of snapshot cache misses before starting a live call.",
  },
);
const openAiRealtimeErrorCounter = meter.createCounter(
  "voice_gateway.openai_realtime_error_total",
  {
    description: "Number of OpenAI Realtime websocket and provider failures.",
  },
);
const openAiTurnLatencyHistogram = meter.createHistogram(
  "voice_gateway.openai_turn_latency_ms",
  {
    description: "Latency for assistant response turns.",
    unit: "ms",
  },
);
const toolExecutionLatencyHistogram = meter.createHistogram(
  "voice_gateway.tool_execution_latency_ms",
  {
    description: "Latency for voice tool execution calls.",
    unit: "ms",
  },
);
const toolExecutionFailureCounter = meter.createCounter(
  "voice_gateway.tool_execution_failure_total",
  {
    description: "Number of tool execution failures.",
  },
);
const recordingUploadFailureCounter = meter.createCounter(
  "voice_gateway.recording_upload_failure_total",
  {
    description: "Number of failed call recording uploads.",
  },
);

export async function startObservability(): Promise<void> {
  if (sdk) {
    return;
  }

  const exporterConfig = getExporterConfig();
  if (!exporterConfig) {
    return;
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": "ai-receptionist-voice-gateway",
      "service.namespace": "ai-receptionist",
      "deployment.environment": exporterConfig.deploymentMode,
    }),
    traceExporter: new OTLPTraceExporter(
      buildExporterOptions(exporterConfig.endpoint, exporterConfig.headers),
    ),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(
        buildExporterOptions(exporterConfig.endpoint, exporterConfig.headers),
      ),
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter(
          buildExporterOptions(exporterConfig.endpoint, exporterConfig.headers),
        ),
      ),
    ],
    instrumentations: [getNodeAutoInstrumentations()],
  });

  await sdk.start();
}

export async function shutdownObservability(): Promise<void> {
  if (!sdk) {
    return;
  }

  const activeSdk = sdk;
  sdk = null;
  await activeSdk.shutdown();
}

export function sanitizeAttributes(attributes?: Attributes): Attributes | undefined {
  if (!attributes) {
    return undefined;
  }
  return redactOtelAttributes(attributes as Record<string, string | number | boolean | undefined>);
}

export async function startActiveSpan<T>(
  name: string,
  attributes: Attributes | undefined,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const options = attributes
    ? { attributes: sanitizeAttributes(attributes)! }
    : null;

  const run = async (span: Span): Promise<T> => {
    try {
      return await fn(span);
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
      throw error;
    } finally {
      span.end();
    }
  };

  if (options) {
    return (await tracer.startActiveSpan(name, options, run)) as Promise<T>;
  }

  return (await tracer.startActiveSpan(name, run)) as Promise<T>;
}

export function addActiveCalls(delta: number, attributes?: Attributes): void {
  activeCallsCounter.add(delta, sanitizeAttributes(attributes));
}

export function recordTwilioInvalidSignature(attributes?: Attributes): void {
  invalidSignatureCounter.add(1, sanitizeAttributes(attributes));
}

export function recordMediaStreamDisconnect(attributes?: Attributes): void {
  mediaDisconnectCounter.add(1, sanitizeAttributes(attributes));
}

export function recordSnapshotCacheHit(attributes?: Attributes): void {
  snapshotCacheHitCounter.add(1, sanitizeAttributes(attributes));
}

export function recordSnapshotCacheMiss(attributes?: Attributes): void {
  snapshotCacheMissCounter.add(1, sanitizeAttributes(attributes));
}

export function recordOpenAiRealtimeError(attributes?: Attributes): void {
  openAiRealtimeErrorCounter.add(1, sanitizeAttributes(attributes));
}

export function recordOpenAiTurnLatency(
  latencyMs: number,
  attributes?: Attributes,
): void {
  openAiTurnLatencyHistogram.record(latencyMs, sanitizeAttributes(attributes));
}

export function recordToolExecutionLatency(
  latencyMs: number,
  attributes?: Attributes,
): void {
  toolExecutionLatencyHistogram.record(latencyMs, sanitizeAttributes(attributes));
}

export function recordToolExecutionFailure(attributes?: Attributes): void {
  toolExecutionFailureCounter.add(1, sanitizeAttributes(attributes));
}

export function recordRecordingUploadFailure(attributes?: Attributes): void {
  recordingUploadFailureCounter.add(1, sanitizeAttributes(attributes));
}

export function getActiveTraceContext(): {
  trace_id?: string;
  span_id?: string;
} {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext) {
    return {};
  }
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
  };
}
