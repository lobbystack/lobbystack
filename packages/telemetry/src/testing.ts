import {
  validateTelemetryEvent,
  type DeploymentMode,
  type TelemetryEventName,
  type TelemetryProperties,
} from "./index.js";

export type RecordedTelemetryEvent = {
  name: TelemetryEventName;
  deploymentMode: DeploymentMode;
  properties: TelemetryProperties;
};

export function createTelemetryRecorder() {
  const events: RecordedTelemetryEvent[] = [];
  return {
    events,
    record(event: RecordedTelemetryEvent): void {
      const validation = validateTelemetryEvent({
        name: event.name,
        deploymentMode: event.deploymentMode,
        properties: event.properties,
      });
      if (!validation.ok) {
        throw new Error(`Invalid telemetry event ${event.name}: missing ${validation.missing.join(", ")}`);
      }
      events.push(event);
    },
    expectEvent(name: TelemetryEventName, properties: TelemetryProperties = {}): RecordedTelemetryEvent {
      const event = events.find((candidate) =>
        candidate.name === name && Object.entries(properties).every(([key, value]) => candidate.properties[key] === value),
      );
      if (!event) throw new Error(`Expected telemetry event ${name} was not recorded.`);
      return event;
    },
    clear(): void {
      events.length = 0;
    },
  };
}

export function createTestTraceCarrier(): Record<string, string> {
  return {
    traceparent: "00-00000000000000000000000000000001-0000000000000001-01",
  };
}
