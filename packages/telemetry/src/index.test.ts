import { describe, expect, it } from "vitest";

import type { TelemetryEvent } from "./index";
import { createTelemetryFacade } from "./index";

class MemorySink {
  public events: Array<TelemetryEvent> = [];

  async emit(event: TelemetryEvent): Promise<void> {
    this.events.push(event);
  }
}

describe("telemetry redaction", () => {
  it("redacts bodies, transcripts, tokens, and masks phone numbers", async () => {
    const sink = new MemorySink();
    const telemetry = createTelemetryFacade("development", [sink]);

    await telemetry.track({
      name: "sms.inbound_received",
      businessId: "biz-1",
      properties: {
        customerPhone: "+14165550000",
        body: "My name is Jane Doe",
        transcript: "Full transcript",
        internalToken: "secret",
        harmless: "ok",
      },
    });

    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.properties.customerPhone).toBe("***0000");
    expect(sink.events[0]?.properties.body).toBe("[redacted]");
    expect(sink.events[0]?.properties.transcript).toBe("[redacted]");
    expect(sink.events[0]?.properties.internalToken).toBe("[redacted]");
    expect(sink.events[0]?.properties.harmless).toBe("ok");
  });
});
