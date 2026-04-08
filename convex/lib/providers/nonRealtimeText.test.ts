import { describe, expect, it } from "vitest";

import { withAiTelemetryContext } from "./nonRealtimeText";

describe("withAiTelemetryContext", () => {
  it("stores middleware telemetry metadata under providerOptions", () => {
    const input = withAiTelemetryContext<{
      prompt: string;
      providerOptions?: Record<string, unknown>;
    }>(
      {
        prompt: "hello",
      },
      {
        traceId: "trace-123",
        businessId: "business-123",
        properties: {
          channel: "sms",
        },
      },
    );

    expect(input.providerOptions).toMatchObject({
      aiReceptionistTelemetry: {
        traceId: "trace-123",
        businessId: "business-123",
        properties: {
          channel: "sms",
        },
      },
    });
  });
});
