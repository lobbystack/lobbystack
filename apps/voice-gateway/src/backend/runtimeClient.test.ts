import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/telemetry/node", () => ({
  withSpan: (_name: string, _options: unknown, callback: (span: unknown) => unknown) => callback({}),
  injectTraceContext: () => undefined,
}));

vi.mock("../observability/posthog", () => ({
  recordRecordingUploadFailure: vi.fn(),
}));

import { startVoiceCall } from "./runtimeClient";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VOICE_GATEWAY_BASE_URL", "https://voice.example.test");
  vi.stubEnv("BACKEND_INTERNAL_URL", "https://admin.example.test");
  vi.stubEnv("INTERNAL_SERVICE_TOKEN", "test-internal-token");
  fetchMock.mockResolvedValue(new Response(
    JSON.stringify({ callId: "call-1", blocked: false, contactId: "contact-1", conversationId: "conversation-1" }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("startVoiceCall", () => {
  it("posts the provider call id and voice channel that /voice/call/start expects", async () => {
    await startVoiceCall({
      businessId: "11111111-1111-1111-1111-111111111111",
      twilioCallSid: "CA123",
      from: "+12136686869",
      to: "+15812027906",
      startedAt: "2026-09-17T17:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://admin.example.test/voice/call/start");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.providerCallId).toBe("CA123");
    expect(body.channel).toBe("voice");
    expect(body.businessId).toBe("11111111-1111-1111-1111-111111111111");
    expect(body.from).toBe("+12136686869");
    expect(body).not.toHaveProperty("twilioCallSid");
  });

  it("includes gatewaySessionId only when provided", async () => {
    await startVoiceCall({
      businessId: "11111111-1111-1111-1111-111111111111",
      twilioCallSid: "CA456",
      gatewaySessionId: "session-1",
      from: "+12136686869",
      to: "+15812027906",
      startedAt: "2026-09-17T17:00:00.000Z",
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ gatewaySessionId: "session-1", providerCallId: "CA456" });
  });
});
