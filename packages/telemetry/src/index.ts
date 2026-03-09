import type { DeploymentMode } from "@ai-receptionist/shared";

export type TelemetryEventName =
  | "business.snapshot_refreshed"
  | "knowledge.document_indexed"
  | "knowledge.search_executed"
  | "sms.inbound_received"
  | "sms.reply_sent"
  | "voice.snapshot_loaded"
  | "voice.tool_invoked"
  | "appointment.booked"
  | "workflow.started"
  | "workflow.failed";

export type TelemetryEvent = {
  name: TelemetryEventName;
  occurredAt: string;
  deploymentMode: DeploymentMode;
  businessId?: string;
  conversationId?: string;
  properties: Record<string, string | number | boolean | null | undefined>;
};

export interface TelemetrySink {
  emit(event: TelemetryEvent): Promise<void>;
}

export class ConsoleSink implements TelemetrySink {
  async emit(event: TelemetryEvent): Promise<void> {
    // Console output is acceptable in development and tests.
    console.log("[telemetry]", JSON.stringify(event));
  }
}

export class NoopSink implements TelemetrySink {
  async emit(_event: TelemetryEvent): Promise<void> {
    return;
  }
}

export type TelemetryFacade = {
  track(event: Omit<TelemetryEvent, "occurredAt" | "deploymentMode">): Promise<void>;
};

function redactProperties(
  properties: TelemetryEvent["properties"],
): TelemetryEvent["properties"] {
  const redacted: TelemetryEvent["properties"] = {};
  for (const [key, value] of Object.entries(properties)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes("phone") && typeof value === "string" && value.length >= 4) {
      redacted[key] = `***${value.slice(-4)}`;
      continue;
    }
    if (
      normalizedKey.includes("body") ||
      normalizedKey.includes("transcript") ||
      normalizedKey.includes("token")
    ) {
      redacted[key] = "[redacted]";
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

export function createTelemetryFacade(
  deploymentMode: DeploymentMode,
  sinks: Array<TelemetrySink>,
): TelemetryFacade {
  return {
    async track(event) {
      const payload: TelemetryEvent = {
        ...event,
        deploymentMode,
        occurredAt: new Date().toISOString(),
        properties: redactProperties(event.properties),
      };

      await Promise.allSettled(sinks.map((sink) => sink.emit(payload)));
    },
  };
}
