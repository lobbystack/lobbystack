import {
  type Attributes,
  context,
  isSpanContextValid,
  propagation,
  SpanStatusCode,
  trace,
  metrics,
  type Span,
  type SpanOptions,
} from "@opentelemetry/api";
import { logs, SeverityNumber, type AnyValue, type AnyValueMap, type Logger } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, type LogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor, type ReadableSpan, type Span as SdkSpan, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { format } from "node:util";

import { addIdsToCallContext, callContextSpanAttributes, CALL_CONTEXT_SPAN_ATTRIBUTES, currentCallContext, type CallContext } from "./callContext.js";
import { maskString, redactOtelAttributes, redactSignedStorageUrls, shouldRedactKey } from "./redaction.js";

export { redactOtelAttributes } from "./redaction.js";
export { currentCallContext, withCallContext, type CallContext } from "./callContext.js";
export type { Span } from "@opentelemetry/api";

export type TelemetryInitializationOptions = {
  serviceName?: string;
  endpoint?: string;
};

export type TraceContextCarrier = Record<string, string>;

let sdk: NodeSDK | undefined;
let activeLogRecordProcessors: LogRecordProcessor[] = [];
let initialized = false;
let stopRuntimeMetrics: (() => void) | undefined;
let restoreConsole: (() => void) | undefined;
let serviceName = process.env.OTEL_SERVICE_NAME ?? "lobbystack-service";
// logEvent() exports its own record, so the console forwarder skips its line.
let writingEventLog = false;
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

// Values under these keys tie telemetry to a call or a job. Phone-number
// redaction would cut the digit runs out of UUIDs and provider IDs, so a value
// shaped like one (a UUID, or letters and digits with no spaces, @ or +) is
// kept whole.
const identifierKeys = new Set<string>([
  ...Object.keys(CALL_CONTEXT_SPAN_ATTRIBUTES),
  ...Object.values(CALL_CONTEXT_SPAN_ATTRIBUTES),
  "delegationId",
  "jobId",
  "lobbystack.delegation_id",
  "lobbystack.job_id",
  "outboxId",
  "traceId",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^(?=.*[A-Za-z])[A-Za-z0-9_.:-]{1,128}$/;

function isIdentifier(key: string | undefined, value: unknown): value is string {
  return key !== undefined && identifierKeys.has(key) && typeof value === "string" && (UUID.test(value) || IDENTIFIER.test(value));
}

export function redactExportAttributes(attributes: Attributes): Attributes {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => {
    if (isIdentifier(key, value)) return [key, value];
    if (forcedExportRedactionKeys.has(key) || shouldRedactKey(key)) {
      return [key, typeof value === "string" && key.toLowerCase().includes("phone") ? maskString(value) : "[redacted]"];
    }
    return [key, typeof value === "string" ? redactOtelExceptionText(value) : value];
  }));
}

export function redactExportLogValue(value: AnyValue, key?: string): AnyValue {
  if (isIdentifier(key, value)) return value;
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

// Every span started during a call, from database transactions to provider
// requests and jobs, carries the call's IDs.
class CallContextSpanProcessor implements SpanProcessor {
  onStart(span: SdkSpan): void {
    span.setAttributes(callContextSpanAttributes(currentCallContext()));
  }

  onEnd(): void {}
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
    // Drizzle appends every bound parameter (tokens, ids, emails) to query errors.
    .replace(/(^|\n)params: [\s\S]*?(?=\n\s+at |$)/, "$1params: [omitted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]+\b/g, "[redacted-key]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g, "[redacted-token]")
    .slice(0, 500);
}

export async function initializeTelemetry(
  options: TelemetryInitializationOptions = {},
): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;
  serviceName = options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? "lobbystack-service";

  const endpoint = (options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT)?.replace(/\/$/, "");
  if (!endpoint) {
    return;
  }

  const resource = resourceFromAttributes({
    "service.namespace": "lobbystack",
    "service.name": serviceName,
    "service.version": serviceVersion(),
    "deployment.environment": process.env.NODE_ENV ?? "development",
  });
  // The OTLP exporters read OTEL_EXPORTER_OTLP_HEADERS from the environment.
  const logRecordProcessors: LogRecordProcessor[] = [
    {
      onEmit(logRecord) {
        const sanitized = redactLogExportAttributes(logRecord.attributes);
        for (const [key, value] of Object.entries(sanitized)) logRecord.setAttribute(key, value);
        logRecord.setBody(redactExportLogValue(logRecord.body));
      },
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    },
    new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs` }) }),
  ];
  activeLogRecordProcessors = logRecordProcessors;

  sdk = new NodeSDK({
    resource,
    spanProcessors: [new CallContextSpanProcessor(), new RedactingSpanProcessor(), new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }))],
    logRecordProcessors,
    instrumentations: [new HttpInstrumentation({ ignoreOutgoingRequestHook: isStorageHttpRequest }), new UndiciInstrumentation({ ignoreRequestHook: isStorageHttpRequest })],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 15_000,
    }),
  });

  try {
    await sdk.start();
    const delay = monitorEventLoopDelay({ resolution: 20 });
    delay.enable();
    const meter = getMeter("lobbystack-runtime");
    const heap = meter.createObservableGauge("process.memory.heap_used_bytes", { unit: "By" });
    const rss = meter.createObservableGauge("process.memory.rss_bytes", { unit: "By" });
    const external = meter.createObservableGauge("process.memory.external_bytes", { unit: "By" });
    const arrayBuffers = meter.createObservableGauge("process.memory.array_buffers_bytes", { unit: "By" });
    const eventLoop = meter.createObservableGauge("process.event_loop.delay_p99_ms", { unit: "ms" });
    const callback: Parameters<typeof meter.addBatchObservableCallback>[0] = result => {
      const memory = process.memoryUsage();
      result.observe(heap, memory.heapUsed);
      result.observe(rss, memory.rss);
      result.observe(external, memory.external);
      result.observe(arrayBuffers, memory.arrayBuffers);
      if (delay.count > 0) result.observe(eventLoop, delay.percentile(99) / 1_000_000);
      delay.reset();
    };
    const runtimeMetrics = [heap, rss, external, arrayBuffers, eventLoop];
    meter.addBatchObservableCallback(callback, runtimeMetrics);
    stopRuntimeMetrics = () => { delay.disable(); meter.removeBatchObservableCallback(callback, runtimeMetrics); };
    restoreConsole = forwardConsoleToLogs();
  } catch (error) {
    // Telemetry is deliberately best effort and must never block startup.
    console.warn("[otel] exporter initialization failed", error instanceof Error ? error.message : String(error));
  }
}

// Match the admin's releaseVersion(): SERVICE_VERSION can go stale on Railway.
function serviceVersion(): string {
  return process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || process.env.SERVICE_VERSION || "development";
}

const SEVERITY = { info: SeverityNumber.INFO, warn: SeverityNumber.WARN, error: SeverityNumber.ERROR } as const;

// Console warnings and errors also go out as OTel logs, tied to the active
// trace and the current call. The redacting processor scrubs them like any
// other log.
function forwardConsoleToLogs(): () => void {
  const logger = getLogger("lobbystack.console");
  const originals = { warn: console.warn, error: console.error };
  for (const level of ["warn", "error"] as const) {
    console[level] = (...args: unknown[]) => {
      originals[level].apply(console, args);
      if (writingEventLog) return;
      logger.emit({ severityNumber: SEVERITY[level], severityText: level.toUpperCase(), body: format(...args), attributes: { ...currentCallContext() } });
    };
  }
  return () => { Object.assign(console, originals); };
}

export async function shutdownTelemetry(): Promise<void> {
  restoreConsole?.();
  restoreConsole = undefined;
  stopRuntimeMetrics?.();
  stopRuntimeMetrics = undefined;
  const activeSdk = sdk;
  sdk = undefined;
  activeLogRecordProcessors = [];
  initialized = false;

  const shutdown = Promise.allSettled(activeSdk ? [activeSdk.shutdown()] : []);
  await Promise.race([shutdown, new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
  logs.disable();
}

export async function forceFlushTelemetryLogs(): Promise<void> {
  await Promise.all(activeLogRecordProcessors.map((processor) => processor.forceFlush()));
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

export type LogLevel = keyof typeof SEVERITY;

/** An error's message, redacted, for a log line or an attribute. */
export function errorText(error: unknown): string {
  return redactOtelExceptionText(error instanceof Error ? error.message : String(error));
}

/**
 * Prints one JSON line with the current call's IDs and the active trace, and
 * exports the same record as an OTel log. Railway reads `level` and `message`
 * and makes every other field filterable, such as `@callId:<id>`. A value
 * under `error` is reduced to its redacted message. Never pass transcript
 * text, phone numbers or other customer content.
 */
export function logEvent(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  const record: Record<string, unknown> = { ...currentCallContext() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) record[key] = key === "error" || value instanceof Error ? errorText(value) : value;
  }
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (spanContext && isSpanContextValid(spanContext)) record.traceId = spanContext.traceId;
  let line: string;
  try {
    line = JSON.stringify({ level, message, ...record });
  } catch {
    line = JSON.stringify({ level, message, ...currentCallContext() });
  }
  writingEventLog = true;
  try {
    console[level](line);
  } finally {
    writingEventLog = false;
  }
  const { level: _level, message: _message, ...attributes } = JSON.parse(line) as AnyValueMap;
  getLogger("lobbystack.events").emit({ severityNumber: SEVERITY[level], severityText: level.toUpperCase(), body: message, attributes });
}

/** Adds IDs learned during a call, such as the call ID once the call is saved, to its context and the active span. */
export function addToCallContext(ids: CallContext): void {
  addIdsToCallContext(ids);
  trace.getActiveSpan()?.setAttributes(callContextSpanAttributes(ids));
}

type ErrorReportClient = { captureExceptionImmediate(error: unknown, distinctId?: string, properties?: Record<string, unknown>): Promise<void> };

let errorReportClient: ErrorReportClient | undefined;
const reportedErrors = new WeakSet<object>();

// Keep the database diagnosis (SQLSTATE, constraint, table) that Drizzle wraps
// in `cause`; skip `detail`, which echoes row values, and mask quoted literals
// in `message` (e.g. `invalid input syntax for type uuid: "<value>"`).
function databaseCause(error: Error): Record<string, string> | undefined {
  const cause: unknown = error.cause;
  if (!cause || typeof cause !== "object") return undefined;
  const fields: Record<string, string> = {};
  for (const key of ["name", "message", "code", "severity", "constraint", "table", "column", "routine"] as const) {
    const value = (cause as Record<string, unknown>)[key];
    if (typeof value === "string" && value) fields[key] = redactOtelExceptionText(key === "message" ? value.replace(/"[^"]*"/g, '"[value]"') : value);
  }
  return Object.keys(fields).length ? fields : undefined;
}

async function loadErrorReportClient(): Promise<ErrorReportClient | undefined> {
  const key = process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.POSTHOG_API_KEY;
  if (!key) return undefined;
  if (!errorReportClient) {
    const { PostHog } = await import("posthog-node");
    errorReportClient = new PostHog(key, { host: process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com", flushAt: 1, flushInterval: 0 });
  }
  return errorReportClient;
}

/**
 * Reports an exception to PostHog error tracking with the current call's IDs,
 * logs it as an `exception` line, and records it on the active span. The
 * message, stack and database cause are redacted first. Each error object is
 * reported once, and reporting never throws.
 */
export async function reportError(error: unknown, properties: { operation: string } & Record<string, string | number | boolean | undefined>): Promise<void> {
  if (error && typeof error === "object") {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
  }
  const original = error instanceof Error ? error : new Error("Non-Error exception");
  const safe = new Error(redactOtelExceptionText(original.message));
  safe.name = original.name;
  if (original.stack) safe.stack = original.stack.split("\n").slice(0, 30).map(redactOtelExceptionText).join("\n");
  const cause = databaseCause(original);
  const report = {
    ...properties,
    ...currentCallContext(),
    service: serviceName,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
    release: serviceVersion(),
    alertable: true,
    ...(cause ? { cause } : {}),
  };
  logEvent("error", "exception", { ...report, exceptionType: safe.name, error: safe.message, stack: safe.stack });
  recordException(safe);
  try {
    const client = await loadErrorReportClient();
    await client?.captureExceptionImmediate(safe, `system:${serviceName}`, report);
  } catch {
    logEvent("warn", "exception.delivery_failed", { operation: properties.operation });
  }
}

/**
 * Starts a span that outlives the callback, such as a call's, and runs the
 * callback with it active, so the work the callback starts nests under it.
 * The caller ends the span.
 */
export function withOpenSpan<T>(name: string, options: SpanOptions, callback: (span: Span) => T): T {
  const span = getTracer().startSpan(name, options);
  return context.with(trace.setSpan(context.active(), span), callback, undefined, span);
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
