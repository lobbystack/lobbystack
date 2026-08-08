import {
  context,
  metrics,
  propagation,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

import { redactOtelAttributes } from "./index";

export type TraceCarrier = Record<string, string | undefined>;

export type TelemetryLogger = {
  debug(message: string, attributes?: Attributes): void;
  info(message: string, attributes?: Attributes): void;
  warn(message: string, attributes?: Attributes): void;
  error(message: string, attributes?: Attributes): void;
};

export type InitializeTelemetryConfig = {
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  endpoint?: string;
  headers?: Record<string, string>;
};

let tracerProvider: NodeTracerProvider | undefined;
let meterProvider: MeterProvider | undefined;
let loggerProvider: LoggerProvider | undefined;
let telemetryServiceName = "lobbystack-service";
let propagatorConfigured = false;
let logExporterEnabled = false;

function parseHeaders(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim().split("=", 2))
      .filter(
        (entry): entry is [string, string] =>
          Boolean(entry[0] && entry[1]),
      ),
  );
}

function signalUrl(endpoint: string, signal: "traces" | "metrics" | "logs"): string {
  const normalized = endpoint.replace(/\/$/, "");
  return normalized.endsWith(`/v1/${signal}`)
    ? normalized
    : `${normalized}/v1/${signal}`;
}

function toScalarAttributes(
  attributes: Attributes,
): Record<string, string | number | boolean | undefined> {
  const scalar: Record<string, string | number | boolean | undefined> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      scalar[key] = value;
    }
  }

  return scalar;
}

export async function initializeTelemetry(
  config: InitializeTelemetryConfig = {},
): Promise<void> {
  if (tracerProvider || meterProvider) {
    return;
  }

  telemetryServiceName =
    config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? telemetryServiceName;
  const endpoint = config.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const headers =
    config.headers ?? parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
  const serviceVersion =
    config.serviceVersion ?? process.env.GIT_SHA ?? "dev";
  const environment =
    config.environment ?? process.env.NODE_ENV ?? "development";

  if (!propagatorConfigured) {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    propagatorConfigured = true;
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAMESPACE]: "lobbystack",
    [ATTR_SERVICE_NAME]: telemetryServiceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    "deployment.environment": environment,
  });

  try {
    const traceExporter = endpoint
      ? new OTLPTraceExporter({
          url: signalUrl(endpoint, "traces"),
          headers,
        })
      : undefined;
    const metricReader = endpoint
      ? new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: signalUrl(endpoint, "metrics"),
            headers,
          }),
          exportIntervalMillis: 15_000,
        })
      : undefined;

    tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: traceExporter
        ? [new BatchSpanProcessor(traceExporter)]
        : [],
    });
    tracerProvider.register();

    meterProvider = new MeterProvider({
      resource,
      readers: metricReader ? [metricReader] : [],
    });
    metrics.setGlobalMeterProvider(meterProvider);

    logExporterEnabled = Boolean(endpoint);
    loggerProvider = new LoggerProvider({
      resource,
      processors: endpoint
        ? [
            new BatchLogRecordProcessor(
              new OTLPLogExporter({
                url: signalUrl(endpoint, "logs"),
                headers,
              }),
            ),
          ]
        : [],
    });
    logs.setGlobalLoggerProvider(loggerProvider);
  } catch (error) {
    tracerProvider = undefined;
    meterProvider = undefined;
    loggerProvider = undefined;
    logExporterEnabled = false;
    console.warn(
      "[telemetry] OpenTelemetry initialization failed; continuing without exporter",
      error,
    );
  }
}

export async function shutdownTelemetry(): Promise<void> {
  const activeTracerProvider = tracerProvider;
  const activeMeterProvider = meterProvider;
  const activeLoggerProvider = loggerProvider;

  tracerProvider = undefined;
  meterProvider = undefined;
  loggerProvider = undefined;
  logExporterEnabled = false;

  if (!activeTracerProvider && !activeMeterProvider && !activeLoggerProvider) {
    return;
  }

  await Promise.all([
    activeTracerProvider?.shutdown(),
    activeMeterProvider?.shutdown(),
    activeLoggerProvider?.shutdown(),
  ]).catch((error) => {
    console.warn("[telemetry] OpenTelemetry shutdown failed", error);
  });
}

export function getTracer(name: string = telemetryServiceName): Tracer {
  return trace.getTracer(name);
}

export function getMeter(name: string = telemetryServiceName) {
  return metrics.getMeter(name);
}

const LOG_LEVEL_TO_SEVERITY = {
  debug: { severityNumber: SeverityNumber.DEBUG, severityText: "DEBUG" },
  info: { severityNumber: SeverityNumber.INFO, severityText: "INFO" },
  warn: { severityNumber: SeverityNumber.WARN, severityText: "WARN" },
  error: { severityNumber: SeverityNumber.ERROR, severityText: "ERROR" },
} as const;

function emitLogRecord(
  level: keyof typeof LOG_LEVEL_TO_SEVERITY,
  message: string,
  attributes: Attributes,
): void {
  const safeAttributes = redactOtelAttributes(toScalarAttributes(attributes));

  if (!logExporterEnabled || !loggerProvider) {
    const line =
      Object.keys(safeAttributes).length > 0
        ? `${message} ${JSON.stringify(safeAttributes)}`
        : message;
    console[level](line);
    return;
  }

  loggerProvider.getLogger("lobbystack").emit({
    severityNumber: LOG_LEVEL_TO_SEVERITY[level].severityNumber,
    severityText: LOG_LEVEL_TO_SEVERITY[level].severityText,
    body: message,
    attributes: safeAttributes,
    timestamp: Date.now(),
  });
}

export function getLogger(): TelemetryLogger {
  const write = (
    level: keyof typeof LOG_LEVEL_TO_SEVERITY,
    message: string,
    attributes?: Attributes,
  ) => {
    emitLogRecord(level, message, attributes ?? {});
  };

  return {
    debug: (message, attributes) => write("debug", message, attributes),
    info: (message, attributes) => write("info", message, attributes),
    warn: (message, attributes) => write("warn", message, attributes),
    error: (message, attributes) => write("error", message, attributes),
  };
}

export function injectTraceContext(carrier: TraceCarrier): void {
  const setter = {
    set(target: TraceCarrier, key: string, value: string) {
      target[key] = value;
    },
  };

  propagation.inject(context.active(), carrier, setter);
}

export function extractTraceContext(carrier: TraceCarrier): Context {
  const getter = {
    keys: (target: TraceCarrier) => Object.keys(target),
    get: (target: TraceCarrier, key: string) => target[key],
  };

  return propagation.extract(ROOT_CONTEXT, carrier, getter);
}

export async function withSpan<T>(
  name: string,
  operation: (span: Span) => Promise<T> | T,
  attributes: Attributes = {},
): Promise<T> {
  const tracer = getTracer();

  return tracer.startActiveSpan(
    name,
    { attributes: redactOtelAttributes(toScalarAttributes(attributes)) },
    async (span) => {
      try {
        const result = await operation(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        recordException(span, error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function recordException(span: Span, error: unknown): void {
  const exception = error instanceof Error ? error : new Error(String(error));
  span.recordException(exception);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: exception.message.slice(0, 200),
  });
}
