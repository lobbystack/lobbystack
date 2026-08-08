import { metrics, trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
} from "@opentelemetry/semantic-conventions";

export { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
export { InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";

export class InMemoryMetricReader {
  readonly exporter: InMemoryMetricExporter;
  readonly reader: PeriodicExportingMetricReader;

  constructor(
    aggregationTemporality: AggregationTemporality = AggregationTemporality.CUMULATIVE,
  ) {
    this.exporter = new InMemoryMetricExporter(aggregationTemporality);
    this.reader = new PeriodicExportingMetricReader({
      exporter: this.exporter,
      exportIntervalMillis: 50,
    });
  }

  getMetrics() {
    return this.exporter.getMetrics();
  }

  reset(): void {
    this.exporter.reset();
  }
}

let sharedSpanExporter: InMemorySpanExporter | undefined;
let sharedMetricReader: InMemoryMetricReader | undefined;
let sharedTracerProvider: NodeTracerProvider | undefined;
let sharedMeterProvider: MeterProvider | undefined;

export function createTestTelemetry() {
  if (!sharedSpanExporter) {
    sharedSpanExporter = new InMemorySpanExporter();
    sharedMetricReader = new InMemoryMetricReader();
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAMESPACE]: "lobbystack",
      [ATTR_SERVICE_NAME]: "lobbystack-test",
    });

    sharedTracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [new SimpleSpanProcessor(sharedSpanExporter)],
    });
    sharedTracerProvider.register();

    sharedMeterProvider = new MeterProvider({
      resource,
      readers: [sharedMetricReader.reader],
    });
    metrics.setGlobalMeterProvider(sharedMeterProvider);
  } else {
    sharedSpanExporter.reset();
    sharedMetricReader?.reset();
  }

  return {
    spanExporter: sharedSpanExporter,
    metricReader: sharedMetricReader!,
    getTracer: (name = "lobbystack-test") => trace.getTracer(name),
    getMeter: (name = "lobbystack-test") => metrics.getMeter(name),
    async forceFlush(): Promise<void> {
      await Promise.all([
        sharedTracerProvider?.forceFlush(),
        sharedMeterProvider?.forceFlush(),
      ]);
    },
    async shutdown(): Promise<void> {
      await Promise.all([
        sharedTracerProvider?.shutdown(),
        sharedMeterProvider?.shutdown(),
      ]);
      sharedSpanExporter = undefined;
      sharedMetricReader = undefined;
      sharedTracerProvider = undefined;
      sharedMeterProvider = undefined;
    },
    reset(): void {
      sharedSpanExporter?.reset();
      sharedMetricReader?.reset();
    },
  };
}
