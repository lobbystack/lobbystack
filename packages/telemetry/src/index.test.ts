import { describe, expect, it } from "vitest";

import type { TelemetryEvent } from "./index";
import {
  createTelemetryFacade,
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
  getPostHogDistinctIdForOperator,
  redactAiTraceProperties,
  redactOtelAttributes,
} from "./index";

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
    expect(sink.events[0]?.properties.internalToken).toBe("secret");
    expect(sink.events[0]?.properties.harmless).toBe("ok");
  });

  it("redacts nested AI trace content while leaving aggregate counters intact", () => {
    const properties = redactAiTraceProperties({
      provider: "openai",
      model: "gpt-realtime",
      prompt: "do not leak me",
      toolArguments: {
        customerName: "Jane Doe",
        requestedTime: "tomorrow morning",
      },
      tokenCount: 42,
      tools: ["checkAvailability", "bookAppointment"],
    });

    expect(properties.provider).toBe("openai");
    expect(properties.model).toBe("gpt-realtime");
    expect(properties.prompt).toBe("[redacted]");
    expect(properties.toolArguments).toBe("[redacted]");
    expect(properties.tokenCount).toBe(42);
    expect(properties.tools).toEqual(["checkAvailability", "bookAppointment"]);
  });

  it("redacts OTEL attributes that might contain customer data", () => {
    const attributes = redactOtelAttributes({
      "ai_receptionist.customer_phone": "+14165550000",
      "ai_receptionist.customer_name": "Jane Doe",
      "ai_receptionist.tool_name": "bookAppointment",
      "http.status_code": 200,
    });

    expect(attributes["ai_receptionist.customer_phone"]).toBe("***0000");
    expect(attributes["ai_receptionist.customer_name"]).toBe("[redacted]");
    expect(attributes["ai_receptionist.tool_name"]).toBe("bookAppointment");
    expect(attributes["http.status_code"]).toBe(200);
  });

  it("builds stable PostHog identity keys", () => {
    expect(getPostHogDistinctIdForOperator("user_123")).toBe("user:user_123");
    expect(getPostHogDistinctIdForBusinessSystem("biz_123")).toBe(
      "system:business:biz_123",
    );
    expect(getPostHogBusinessGroupKey("biz_123")).toBe("business:biz_123");
  });
});
