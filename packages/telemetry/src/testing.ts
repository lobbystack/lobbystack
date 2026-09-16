import type { TelemetryEvent, TelemetrySink } from "./index.js";

export class InMemoryTelemetrySink implements TelemetrySink {
  readonly events: TelemetryEvent[] = [];

  async emit(event: TelemetryEvent): Promise<void> {
    this.events.push(event);
  }

  clear(): void {
    this.events.length = 0;
  }
}

export function createTestTraceCarrier(): Record<string, string> {
  return {
    traceparent: "00-00000000000000000000000000000001-0000000000000001-01",
  };
}
