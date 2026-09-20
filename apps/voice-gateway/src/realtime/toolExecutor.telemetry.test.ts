import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { demoSnapshot } from "@lobbystack/shared";

const { captureMock, postHogConstructorMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  postHogConstructorMock: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(function PostHog(...args: unknown[]) {
    postHogConstructorMock(...args);
    return {
      capture: captureMock,
      captureException: vi.fn(),
      shutdown: vi.fn(),
    };
  }),
}));

vi.mock("../backend/runtimeClient", () => ({
  bookVoiceAppointment: vi.fn(),
  cancelVoiceAppointment: vi.fn(),
  checkVoiceAvailability: vi.fn(),
  findVoiceAvailability: vi.fn(),
  lookupVoiceAppointmentForChange: vi.fn(),
  rescheduleVoiceAppointment: vi.fn(),
  searchVoiceKnowledge: vi.fn(),
  sendVoiceAppointmentChangeOtp: vi.fn(),
  takeVoiceMessage: vi.fn(),
  updateVoiceTransferState: vi.fn(),
  verifyVoiceAppointmentChangeOtp: vi.fn(),
  verifyVoiceAppointmentForChange: vi.fn(),
}));

const ENV_KEYS = [
  "BACKEND_INTERNAL_URL",
  "DEPLOYMENT_MODE",
  "INTERNAL_SERVICE_TOKEN",
  "POSTHOG_HOST",
  "POSTHOG_KEY",
  "VOICE_GATEWAY_BASE_URL",
] as const;

describe("voice tool delivery telemetry", () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    captureMock.mockClear();
    postHogConstructorMock.mockClear();

    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
    }

    process.env.BACKEND_INTERNAL_URL = "https://admin.example.com";
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.INTERNAL_SERVICE_TOKEN = "test-service-token";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    process.env.POSTHOG_KEY = "phc_test";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    originalEnv.clear();
    vi.clearAllMocks();
  });

  async function loadExecutor() {
    const posthog = await import("../observability/posthog");
    const { executeVoiceTool } = await import("./toolExecutor");
    return {
      executeVoiceTool,
      setBusinessTelemetryConsent: posthog.setBusinessTelemetryConsent,
    };
  }

  it("emits ops.voice.tool_completed with a phone channel for the phone path", async () => {
    const { executeVoiceTool, setBusinessTelemetryConsent } = await loadExecutor();
    setBusinessTelemetryConsent("business_123", true);

    await executeVoiceTool({
      toolName: "getBusinessHours",
      rawArguments: "{}",
      snapshot: demoSnapshot,
      businessId: "business_123",
      callId: "call_phone_1",
      callerPhone: "+14165550000",
    });

    expect(captureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ops.voice.tool_completed",
        properties: expect.objectContaining({
          businessId: "business_123",
          callId: "call_phone_1",
          toolName: "getBusinessHours",
          provider: "openai",
          channel: "phone",
        }),
      }),
    );
  });

  it("emits ops.voice.tool_completed with the web channel and context duration for the web path", async () => {
    const { executeVoiceTool, setBusinessTelemetryConsent } = await loadExecutor();
    setBusinessTelemetryConsent("business_123", true);

    await executeVoiceTool({
      toolName: "getBusinessHours",
      rawArguments: "{}",
      snapshot: demoSnapshot,
      businessId: "business_123",
      callId: "call_web_1",
      callerPhone: "web",
      channel: "web_voice",
      contextDurationMs: 87,
    });

    expect(captureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ops.voice.tool_completed",
        properties: expect.objectContaining({
          callId: "call_web_1",
          provider: "openai",
          channel: "web",
          contextDurationMs: 87,
        }),
      }),
    );
  });

  it("emits ops.voice.tool_failed with a phone channel for a rejected phone tool call", async () => {
    const { executeVoiceTool, setBusinessTelemetryConsent } = await loadExecutor();
    setBusinessTelemetryConsent("business_123", true);

    await expect(
      executeVoiceTool({
        toolName: "endCall",
        rawArguments: JSON.stringify({ reason: "not_a_reason", message: "Goodbye." }),
        snapshot: demoSnapshot,
        businessId: "business_123",
        callId: "call_phone_2",
        callerPhone: "+14165550000",
      }),
    ).rejects.toThrow();

    expect(captureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ops.voice.tool_failed",
        properties: expect.objectContaining({
          callId: "call_phone_2",
          toolName: "endCall",
          provider: "openai",
          channel: "phone",
        }),
      }),
    );
  });

  it("emits ops.voice.tool_failed with the web channel for a rejected web tool call", async () => {
    const { executeVoiceTool, setBusinessTelemetryConsent } = await loadExecutor();
    setBusinessTelemetryConsent("business_123", true);

    await expect(
      executeVoiceTool({
        toolName: "endCall",
        rawArguments: JSON.stringify({ reason: "not_a_reason", message: "Goodbye." }),
        snapshot: demoSnapshot,
        businessId: "business_123",
        callId: "call_web_2",
        callerPhone: "web",
        channel: "web_voice",
      }),
    ).rejects.toThrow();

    expect(captureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ops.voice.tool_failed",
        properties: expect.objectContaining({
          callId: "call_web_2",
          toolName: "endCall",
          provider: "openai",
          channel: "web",
        }),
      }),
    );
  });
});
