import {
  type Attributes,
  context,
  propagation,
  SpanStatusCode,
  trace,
  metrics,
  type Span,
  type SpanOptions,
} from "@opentelemetry/api";
import { logs, type AnyValue, type AnyValueMap, type Logger } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor, type ReadableSpan, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";

import { maskString, redactOtelAttributes, redactSignedStorageUrls, shouldRedactKey } from "./redaction.js";

export { redactOtelAttributes } from "./redaction.js";

export type TelemetryInitializationOptions = {
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
};

export type TraceContextCarrier = Record<string, string>;

let sdk: NodeSDK | undefined;
let loggerProvider: LoggerProvider | undefined;
let initialized = false;
const storageHttpOrigins = new Set<string>();
const forcedExportRedactionKeys = new Set([
  "db.statement",
  "http.request.body",
  "http.target",
  "http.url",
  "lobbystack.prompt",
  "lobbystack.transcript",
  "messaging.message.body",
  "url.full",
  "url.path",
  "url.query",
]);

export function redactExportAttributes(attributes: Attributes): Attributes {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => {
    if (forcedExportRedactionKeys.has(key) || shouldRedactKey(key)) {
      return [key, typeof value === "string" && key.toLowerCase().includes("phone") ? maskString(value) : "[redacted]"];
    }
    return [key, typeof value === "string" ? redactOtelExceptionText(value) : value];
  }));
}

export function redactExportLogValue(value: AnyValue, key?: string): AnyValue {
  if (key && (forcedExportRedactionKeys.has(key) || shouldRedactKey(key))) {
    return typeof value === "string" && key.toLowerCase().includes("phone") ? maskString(value) : "[redacted]";
  }
  if (typeof value === "string") return redactOtelExceptionText(value);
  if (Array.isArray(value)) return value.map((item) => redactExportLogValue(item));
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(value).map(([nestedKey, nestedValue]) => [
      nestedKey,
      redactExportLogValue(nestedValue, nestedKey),
    ]));
  }
  return value;
}

function redactLogExportAttributes(attributes: AnyValueMap): AnyValueMap {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, redactExportLogValue(value, key)]));
}

function replaceAttributes(target: Attributes, sanitized: Attributes): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, sanitized);
}

class RedactingSpanProcessor implements SpanProcessor {
  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    replaceAttributes(span.attributes, redactExportAttributes(span.attributes));
    for (const event of span.events) {
      if (event.attributes) replaceAttributes(event.attributes, redactExportAttributes(event.attributes));
    }
    for (const link of span.links) {
      if (link.attributes) replaceAttributes(link.attributes, redactExportAttributes(link.attributes));
    }
    if (span.status.message) span.status.message = redactOtelExceptionText(span.status.message);
  }

  forceFlush(): Promise<void> { return Promise.resolve(); }
  shutdown(): Promise<void> { return Promise.resolve(); }
}

export function registerStorageHttpEndpoint(endpoint: string | undefined): void {
  if (!endpoint) return;
  try { storageHttpOrigins.add(new URL(endpoint).host.toLowerCase()); } catch { /* Invalid provider configuration is handled by the provider. */ }
}

export function isStorageHttpRequest(request: unknown): boolean {
  const value = request as { origin?: string | URL; host?: string; hostname?: string; getHeader?(name: string): string | string[] | number | undefined };
  const candidates = [value.origin instanceof URL ? value.origin.host : value.origin, value.host, value.hostname, value.getHeader?.("host")].flatMap((candidate) => Array.isArray(candidate) ? candidate : candidate === undefined ? [] : [String(candidate)]);
  return candidates.some((candidate) => {
    let host = candidate.toLowerCase();
    try { host = new URL(candidate).host.toLowerCase(); } catch { /* Header values are already host-only. */ }
    return storageHttpOrigins.has(host) || /(^|\.)s3[.-][a-z0-9-]+\.amazonaws\.com(?::\d+)?$/.test(host) || /(^|\.)s3\.amazonaws\.com(?::\d+)?$/.test(host);
  });
}

export function redactOtelExceptionText(value: string): string {
  return redactSignedStorageUrls(value)
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]+\b/g, "[redacted-key]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g, "[redacted-token]")
    .slice(0, 500);
}

function configuredEndpoint(options: TelemetryInitializationOptions): string | undefined {
  return options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
}

export function parseOtlpHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const headers = Object.fromEntries(
    raw.split(",").flatMap((entry) => {
      const separator = entry.indexOf("=");
      return separator > 0 ? [[entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()]] : [];
    }),
  );
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function configuredHeaders(options: TelemetryInitializationOptions): Record<string, string> | undefined {
  if (options.headers) {
    return options.headers;
  }
  return parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
}

export async function initializeTelemetry(
  options: TelemetryInitializationOptions = {},
): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  const serviceName = options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? "lobbystack-service";
  const serviceVersion = options.serviceVersion ?? process.env.SERVICE_VERSION ?? "development";
  const environment = options.environment ?? process.env.NODE_ENV ?? "development";
  const endpoint = configuredEndpoint(options);
  const headers = configuredHeaders(options);
  const resource = resourceFromAttributes({
    "service.namespace": "lobbystack",
    "service.name": serviceName,
    "service.version": serviceVersion,
    "deployment.environment": environment,
  });

  if (endpoint && options.enabled !== false) {
    const exporterOptions = {
      url: `${endpoint.replace(/\/$/, "")}/v1/traces`,
      ...(headers ? { headers } : {}),
    };
    const metricsExporter = new OTLPMetricExporter({
      url: `${endpoint.replace(/\/$/, "")}/v1/metrics`,
      ...(headers ? { headers } : {}),
    });
    const traceExporter = new OTLPTraceExporter(exporterOptions);
    sdk = new NodeSDK({
      resource,
      spanProcessors: [new RedactingSpanProcessor(), new BatchSpanProcessor(traceExporter)],
      instrumentations: [new HttpInstrumentation({ ignoreOutgoingRequestHook: isStorageHttpRequest }), new UndiciInstrumentation({ ignoreRequestHook: isStorageHttpRequest })],
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricsExporter,
        exportIntervalMillis: 15_000,
      }),
    });

    loggerProvider = new LoggerProvider({
      resource,
      processors: [
        {
          onEmit(logRecord) {
            const sanitized = redactLogExportAttributes(logRecord.attributes);
            for (const [key, value] of Object.entries(sanitized)) logRecord.setAttribute(key, value);
            logRecord.setBody(redactExportLogValue(logRecord.body));
          },
          forceFlush: () => Promise.resolve(),
          shutdown: () => Promise.resolve(),
        },
        new BatchLogRecordProcessor(
          new OTLPLogExporter({
            url: `${endpoint.replace(/\/$/, "")}/v1/logs`,
            ...(headers ? { headers } : {}),
          }),
        ),
      ],
    });
    logs.setGlobalLoggerProvider(loggerProvider);

    try {
      await sdk.start();
    } catch (error) {
      // Telemetry is deliberately best effort and must never block startup.
      console.warn("[otel] exporter initialization failed", error instanceof Error ? error.message : String(error));
    }
  }
}

export async function shutdownTelemetry(): Promise<void> {
  const activeSdk = sdk;
  const activeLoggerProvider = loggerProvider;
  sdk = undefined;
  loggerProvider = undefined;
  initialized = false;

  const shutdown = Promise.allSettled([
    ...(activeSdk ? [activeSdk.shutdown()] : []),
    ...(activeLoggerProvider ? [activeLoggerProvider.shutdown()] : []),
  ]);
  await Promise.race([shutdown, new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
}

export function getTracer(name = "lobbystack"): ReturnType<typeof trace.getTracer> {
  return trace.getTracer(name);
}

export function getMeter(name = "lobbystack"): ReturnType<typeof metrics.getMeter> {
  return metrics.getMeter(name);
}

export function getLogger(name = "lobbystack"): Logger {
  return logs.getLogger(name);
}

export function injectTraceContext(carrier: TraceContextCarrier): TraceContextCarrier {
  propagation.inject(context.active(), carrier, {
    set(target, key, value) {
      target[key] = value;
    },
  });
  return carrier;
}

export function extractTraceContext(carrier: TraceContextCarrier) {
  return propagation.extract(context.active(), carrier, {
    get(target, key) {
      return target[key];
    },
    keys(target) {
      return Object.keys(target);
    },
  });
}

export async function withExtractedTraceContext<T>(
  carrier: TraceContextCarrier,
  callback: () => Promise<T> | T,
): Promise<T> {
  return await context.with(extractTraceContext(carrier), callback);
}

export async function withSpan<T>(
  name: string,
  options: SpanOptions,
  callback: (span: Span) => Promise<T> | T,
): Promise<T> {
  const tracer = getTracer();
  return await tracer.startActiveSpan(name, options, async (span) => {
    try {
      return await callback(span);
    } catch (error) {
      recordException(error, {}, span);
      throw error;
    } finally {
      span.end();
    }
  });
}

export function recordException(
  error: unknown,
  attributes: Record<string, string | number | boolean | undefined> = {},
  span?: Span,
): void {
  const activeSpan = span ?? trace.getActiveSpan();
  if (!activeSpan) {
    return;
  }
  const exception = error instanceof Error ? error : new Error(String(error));
  activeSpan.recordException({
    name: exception.name,
    message: redactOtelExceptionText(exception.message),
    ...(exception.stack ? { stack: redactOtelExceptionText(exception.stack) } : {}),
  });
  activeSpan.setStatus({ code: SpanStatusCode.ERROR });
  activeSpan.setAttributes(redactOtelAttributes(attributes));
}

export function setSpanAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean | undefined>,
): void {
  span.setAttributes(redactOtelAttributes(attributes));
}
