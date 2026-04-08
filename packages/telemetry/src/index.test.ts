import { describe, expect, it } from "vitest";

import type { TelemetryEvent } from "./index";
import {
  bucketLatencyMs,
  createTelemetryFacade,
  getTelemetryRequiredProperties,
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
  getPostHogDistinctIdForOperator,
  redactAiTraceProperties,
  redactOtelAttributes,
  validateTelemetryEvent,
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
    expect(sink.events[0]?.properties.internalToken).toBe("[redacted]");
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

  it("keeps token usage metrics while redacting credential-like token fields", () => {
    const properties = redactAiTraceProperties({
      access_token: "secret-access-token",
      refreshToken: "secret-refresh-token",
      totalTokens: 120,
      inputTokens: 55,
    });

    expect(properties.access_token).toBe("[redacted]");
    expect(properties.refreshToken).toBe("[redacted]");
    expect(properties.totalTokens).toBe(120);
    expect(properties.inputTokens).toBe(55);
  });

  it("preserves workflowName while still redacting sensitive name fields", () => {
    const properties = redactAiTraceProperties({
      workflowName: "appointmentCalendarSyncWorkflow",
      customerName: "Jane Doe",
    });

    expect(properties.workflowName).toBe("appointmentCalendarSyncWorkflow");
    expect(properties.customerName).toBe("[redacted]");
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

  it("documents required properties for meaningful product events", () => {
    expect(getTelemetryRequiredProperties("web.messages.reply_sent")).toEqual([
      "businessId",
      "deploymentMode",
      "conversationId",
      "channel",
    ]);
    expect(getTelemetryRequiredProperties("appointment.booked")).toEqual([
      "businessId",
      "deploymentMode",
      "appointmentId",
      "channel",
      "serviceId",
      "sourceChannel",
    ]);
    expect(getTelemetryRequiredProperties("ops.voice.tool_completed")).toEqual([
      "businessId",
      "deploymentMode",
      "callId",
      "provider",
      "model",
      "toolName",
      "latencyBucket",
    ]);
  });

  it("validates required telemetry properties across top-level context and event props", () => {
    const valid = validateTelemetryEvent({
      name: "appointment.booked",
      deploymentMode: "cloud",
      businessId: "biz-1",
      appointmentId: "apt-1",
      channel: "sms",
      properties: {
        serviceId: "svc-1",
        sourceChannel: "sms",
      },
    });

    const invalid = validateTelemetryEvent({
      name: "web.messages.thread_opened",
      deploymentMode: "cloud",
      properties: {
        businessId: "biz-1",
      },
    });

    expect(valid).toEqual({ ok: true, missing: [] });
    expect(invalid.ok).toBe(false);
    expect(invalid.missing).toEqual(["conversationId", "channel"]);
  });

  it("buckets operational latency values into stable ranges", () => {
    expect(bucketLatencyMs(120)).toBe("under_500ms");
    expect(bucketLatencyMs(800)).toBe("500ms_to_1s");
    expect(bucketLatencyMs(1_700)).toBe("1s_to_2_5s");
    expect(bucketLatencyMs(3_600)).toBe("2_5s_to_5s");
    expect(bucketLatencyMs(8_100)).toBe("over_5s");
  });
});
