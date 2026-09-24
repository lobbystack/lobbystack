import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const {
  appendVoiceTranscriptMock,
  bindWebVoiceProviderMock,
  bookVoiceAppointmentMock,
  buildVoiceSystemPromptMock,
  captureAiGenerationMock,
  captureAiTraceStartedMock,
  capturePostHogExceptionMock,
  completeVoiceCallMock,
  fetchWebCallRecordingTargetMock,
  fetchWebVoiceContextMock,
  markWebVoiceMediaStartedMock,
  runtimeRequestErrorClass,
  startWebVoiceCallMock,
  searchVoiceKnowledgeMock,
  takeVoiceMessageMock,
  uploadVoiceRecordingMock,
  updateVoiceCallPresenceMock,
  webSocketInstances,
} = vi.hoisted(() => ({
  appendVoiceTranscriptMock: vi.fn(),
  bindWebVoiceProviderMock: vi.fn(),
  bookVoiceAppointmentMock: vi.fn(),
  buildVoiceSystemPromptMock: vi.fn(),
  captureAiGenerationMock: vi.fn(),
  captureAiTraceStartedMock: vi.fn(),
  capturePostHogExceptionMock: vi.fn(),
  completeVoiceCallMock: vi.fn(),
  fetchWebCallRecordingTargetMock: vi.fn(),
  fetchWebVoiceContextMock: vi.fn(),
  markWebVoiceMediaStartedMock: vi.fn(),
  runtimeRequestErrorClass: class RuntimeRequestError extends Error {
    status: number;
    code?: string;

    constructor(input: { message: string; status: number; code?: string }) {
      super(input.message);
      this.name = "RuntimeRequestError";
      this.status = input.status;
      if (input.code !== undefined) {
        this.code = input.code;
      }
    }
  },
  startWebVoiceCallMock: vi.fn(),
  searchVoiceKnowledgeMock: vi.fn(),
  takeVoiceMessageMock: vi.fn(),
  uploadVoiceRecordingMock: vi.fn(),
  updateVoiceCallPresenceMock: vi.fn(),
  webSocketInstances: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: Array<unknown>) => void;
    options: unknown;
    send: ReturnType<typeof vi.fn>;
    url: string | URL;
  }>,
}));

vi.mock("@lobbystack/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/ai")>();
  buildVoiceSystemPromptMock.mockImplementation(actual.buildVoiceSystemPrompt);
  return {
    ...actual,
    buildVoiceSystemPrompt: buildVoiceSystemPromptMock,
  };
});

vi.mock("ws", () => {
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;

    readyState = MockWebSocket.OPEN;
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.handlers.close?.forEach((handler) => handler());
    });
    options: unknown;
    send = vi.fn();
    url: string | URL;
    private handlers: Record<string, Array<(...args: Array<unknown>) => void>> =
      {};

    constructor(url: string | URL, options?: unknown) {
      this.url = url;
      this.options = options;
      webSocketInstances.push(this);
    }

    on(event: string, handler: (...args: Array<unknown>) => void) {
      this.handlers[event] = [...(this.handlers[event] ?? []), handler];
      return this;
    }

    emit(event: string, ...args: Array<unknown>) {
      this.handlers[event]?.forEach((handler) => handler(...args));
    }
  }

  class MockWebSocketServer {
    clients = new Set();
    close = vi.fn();
    handleUpgrade = vi.fn(
      (
        _request: unknown,
        _socket: unknown,
        _head: unknown,
        callback: (socket: MockWebSocket) => void,
      ) => {
        callback(new MockWebSocket("ws://localhost"));
      },
    );
  }

  return { default: MockWebSocket, WebSocketServer: MockWebSocketServer };
});

vi.mock("../backend/runtimeClient", () => ({
  appendVoiceTranscript: appendVoiceTranscriptMock,
  bindWebVoiceProvider: bindWebVoiceProviderMock,
  completeVoiceCall: completeVoiceCallMock,
  fetchWebCallRecordingTarget: fetchWebCallRecordingTargetMock,
  fetchWebVoiceContext: fetchWebVoiceContextMock,
  markWebVoiceMediaStarted: markWebVoiceMediaStartedMock,
  recordVoiceAiCost: vi.fn(),
  RuntimeRequestError: runtimeRequestErrorClass,
  startWebVoiceCall: startWebVoiceCallMock,
  uploadVoiceRecording: uploadVoiceRecordingMock,
  updateVoiceCallPresence: updateVoiceCallPresenceMock,
  bookVoiceAppointment: bookVoiceAppointmentMock,
  cancelVoiceAppointment: vi.fn(),
  checkVoiceAvailability: vi.fn(),
  findVoiceAvailability: vi.fn(),
  lookupVoiceAppointmentForChange: vi.fn(),
  rescheduleVoiceAppointment: vi.fn(),
  searchVoiceKnowledge: searchVoiceKnowledgeMock,
  sendVoiceAppointmentChangeOtp: vi.fn(),
  takeVoiceMessage: takeVoiceMessageMock,
  updateVoiceTransferState: vi.fn(),
  verifyVoiceAppointmentChangeOtp: vi.fn(),
  verifyVoiceAppointmentForChange: vi.fn(),
}));

vi.mock("../observability/posthog", async importOriginal => ({
  ...(await importOriginal<typeof import("../observability/posthog")>()),
  captureAiGeneration: captureAiGenerationMock,
  captureAiTraceStarted: captureAiTraceStartedMock,
  capturePostHogException: capturePostHogExceptionMock,
}));

import { UNATTRIBUTABLE_CLIENT_IP } from "@lobbystack/config";
import { demoSnapshot } from "@lobbystack/shared";

import { createServer } from "../http/server";
import * as toolExecutor from "../realtime/toolExecutor";
import {
  createWebRealtimeTurnDetectionConfig,
  resetWebCallRouteStateForTests,
} from "./routes";

function createDashboardTestCallProof(input: {
  businessSlug: string;
  expiresAt?: number;
  nonce?: string;
  token: string;
}): string {
  const payload = [
    "dashboard-test-call",
    input.businessSlug,
    String(input.expiresAt ?? Date.now() + 60_000),
    input.nonce ?? "nonce",
  ].join("|");
  const signature = createHmac("sha256", input.token).update(payload).digest("hex");
  return `${payload}|${signature}`;
}

describe("createWebRealtimeTurnDetectionConfig", () => {
  it("can disable auto responses and interruptions for manual response flows", () => {
    expect(
      createWebRealtimeTurnDetectionConfig({
        createResponse: false,
        interruptResponse: false,
      }),
    ).toEqual({
      type: "server_vad",
      threshold: 0.65,
      prefix_padding_ms: 300,
      silence_duration_ms: 700,
      create_response: false,
      interrupt_response: false,
    });
  });

  it("defaults to interruptible web caller turn handling", () => {
    expect(createWebRealtimeTurnDetectionConfig()).toEqual({
      type: "server_vad",
      threshold: 0.65,
      prefix_padding_ms: 300,
      silence_duration_ms: 700,
      create_response: true,
      interrupt_response: true,
    });
  });
});

describe("web call routes", () => {
  beforeEach(() => {
    updateVoiceCallPresenceMock.mockReset().mockResolvedValue(undefined);
    bindWebVoiceProviderMock.mockReset();
    process.env.DEPLOYMENT_MODE = "development";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
    process.env.BACKEND_INTERNAL_URL = "https://admin.example.com";
    process.env.INTERNAL_SERVICE_TOKEN = "test-service-token";
    process.env.TWILIO_AUTH_TOKEN = "twilio-auth-token";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.WEB_CALL_ALLOWED_ORIGINS = "https://lobbystack.com";
    process.env.WEB_CALL_PUBLIC_BUSINESS_SLUG = "lobbystack";
  });

  afterEach(() => {
    resetWebCallRouteStateForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    webSocketInstances.length = 0;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VOICE_GATEWAY_TRUST_PROXY;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    delete process.env.WEB_CALL_ALLOWED_ORIGINS;
    delete process.env.WEB_CALL_PUBLIC_BUSINESS_SLUG;
    delete process.env.WEB_CALL_MAX_DURATION_MS;
    delete process.env.DASHBOARD_TEST_CALL_TOKEN;
  });

  it("rejects untrusted origins before starting a web call", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(fetchWebVoiceContextMock).not.toHaveBeenCalled();
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
  });

  function safetySetup(count = 1) {
    for (let index = 0; index < count; index++) {
      fetchWebVoiceContextMock.mockResolvedValueOnce({ businessId: "business_safety", snapshot: demoSnapshot });
      startWebVoiceCallMock.mockResolvedValueOnce({ businessId: "business_safety", callId: `call_safety_${index}`, conversationId: `conversation_${index}` });
    }
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/hangup")
      ? new Response(null, { status: 200 })
      : new Response("answer", { status: 200, headers: { location: "/v1/realtime/calls/rtc_safety" } }));
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();
    const start = () => server.inject({ method: "POST", url: "/web-call/sessions", headers: { origin: "https://lobbystack.com" }, payload: { businessSlug: "lobbystack", sdp: "v=0" } });
    return { server, start, fetchMock };
  }

  it("reserves durably before allocating and binds the returned provider ID", async () => {
    const { server, start, fetchMock } = safetySetup();
    const response = await start();
    expect(response.statusCode).toBe(200);
    const sessionId = response.json().sessionId;
    expect(startWebVoiceCallMock).toHaveBeenCalledWith(expect.objectContaining({ providerCallId: `webcall_${sessionId}` }));
    expect(startWebVoiceCallMock.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]!);
    expect(bindWebVoiceProviderMock).toHaveBeenCalledWith({ businessId: "business_safety", callId: "call_safety_0", gatewaySessionId: sessionId, providerCallId: "rtc_safety" });
    expect(markWebVoiceMediaStartedMock).toHaveBeenCalledWith({ businessId: "business_safety", callId: "call_safety_0", gatewaySessionId: sessionId, providerCallId: "rtc_safety", mediaStartedAt: expect.any(String) });
    expect(bindWebVoiceProviderMock.mock.invocationCallOrder[0]).toBeLessThan(markWebVoiceMediaStartedMock.mock.invocationCallOrder[0]!);
    expect(updateVoiceCallPresenceMock).not.toHaveBeenCalled();
    const presence = await server.inject({ method: "POST", url: `/web-call/sessions/${sessionId}/presence`, headers: { origin: "https://lobbystack.com" } });
    expect(presence.statusCode).toBe(204);
    expect(updateVoiceCallPresenceMock).toHaveBeenCalledWith({ businessId: "business_safety", callId: "call_safety_0", active: true });
    await server.close();
    expect(completeVoiceCallMock).toHaveBeenCalledWith(expect.objectContaining({ disposition: "gateway_shutdown" }));
    expect(updateVoiceCallPresenceMock).toHaveBeenLastCalledWith({ businessId: "business_safety", callId: "call_safety_0", active: false });
  });

  it("hangs up and captures duration without waiting for presence cleanup", async () => {
    const { server, start, fetchMock } = safetySetup();
    const response = await start();
    const { sessionId } = response.json() as { sessionId: string };
    let release!: () => void;
    updateVoiceCallPresenceMock.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const ending = server.inject({ method: "POST", url: `/web-call/sessions/${sessionId}/end`, headers: { origin: "https://lobbystack.com" } });
    const finished = Promise.resolve(ending);
    await vi.waitFor(() => expect(completeVoiceCallMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/hangup"), expect.anything());
    release();
    expect((await finished).statusCode).toBe(204);
    await server.close();
  });

  it("allocates only the winner of concurrent durable admission", async () => {
    const { server, start, fetchMock } = safetySetup(2);
    startWebVoiceCallMock.mockReset();
    let claimed = false;
    startWebVoiceCallMock.mockImplementation(async () => {
      if (claimed) throw new runtimeRequestErrorClass({ status: 402, code: "voice_limit_reached", message: "Exhausted" });
      claimed = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { businessId: "business_safety", callId: "winner", conversationId: "conversation" };
    });
    const responses = await Promise.all([start(), start()]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 402]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bindWebVoiceProviderMock).toHaveBeenCalledTimes(1);
    await server.close();
    startWebVoiceCallMock.mockReset();
  });

  it("compensates a failed provider binding and never exposes the session", async () => {
    const { server, start, fetchMock } = safetySetup();
    bindWebVoiceProviderMock.mockRejectedValueOnce(new Error("binding unavailable"));
    expect((await start()).statusCode).toBe(500);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("rtc_safety/hangup"), expect.anything());
    expect(completeVoiceCallMock).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", disposition: "provider_setup_failed" }));
    expect(webSocketInstances).toHaveLength(0);
    await server.close();
  });

  it("retains the reservation when provider allocation times out", async () => {
    const { server, start, fetchMock } = safetySetup();
    fetchMock.mockRejectedValueOnce(new Error("request timed out"));
    expect((await start()).statusCode).toBe(500);
    expect(completeVoiceCallMock).not.toHaveBeenCalled();
    expect(bindWebVoiceProviderMock).not.toHaveBeenCalled();
    await server.close();
  });

  it.each(["response", "exception"])("clears media presence but retains the reservation when provider hangup fails: %s", async (failure) => {
    const { server, start, fetchMock } = safetySetup();
    const response = await start();
    const presence = await server.inject({ method: "POST", url: `/web-call/sessions/${response.json().sessionId}/presence`, headers: { origin: "https://lobbystack.com" } });
    expect(presence.statusCode).toBe(204);
    expect(updateVoiceCallPresenceMock).toHaveBeenLastCalledWith({ businessId: "business_safety", callId: "call_safety_0", active: true });
    if (failure === "response") fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    else fetchMock.mockRejectedValueOnce(new Error("hangup timed out"));
    const end = await server.inject({ method: "POST", url: `/web-call/sessions/${response.json().sessionId}/end`, headers: { origin: "https://lobbystack.com" } });
    expect(end.statusCode).toBe(500);
    expect(completeVoiceCallMock).not.toHaveBeenCalled();
    expect(webSocketInstances[0]!.close).toHaveBeenCalledOnce();
    expect(updateVoiceCallPresenceMock).toHaveBeenLastCalledWith({ businessId: "business_safety", callId: "call_safety_0", active: false });
    await server.close();
  });

  it("does not rearm hangup timers when a terminal tool finishes after cleanup", async () => {
    const { server, start } = safetySetup();
    const response = await start();
    fetchWebVoiceContextMock.mockResolvedValueOnce({ businessId: "business_safety", snapshot: demoSnapshot });
    let resolveTool!: (result: Awaited<ReturnType<typeof toolExecutor.executeVoiceTool>>) => void;
    const execute = vi.spyOn(toolExecutor, "executeVoiceTool").mockImplementationOnce(() => new Promise(resolve => { resolveTool = resolve; }));
    try {
      webSocketInstances[0]!.emit("message", Buffer.from(JSON.stringify({ type: "response.function_call_arguments.done", name: "endCall", call_id: "late-terminal", arguments: "{}" })));
      await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
      await server.inject({ method: "POST", url: `/web-call/sessions/${response.json().sessionId}/end`, headers: { origin: "https://lobbystack.com" } });
      vi.useFakeTimers();
      resolveTool({ result: { ok: true }, endCall: { reason: "caller_finished", message: "Goodbye" } });
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(completeVoiceCallMock).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      execute.mockRestore();
      await server.close();
    }
  });

  it.each(["{", "null", "[]", JSON.stringify({ type: "response.output_audio_transcript.done", transcript: {} }), "x".repeat(256 * 1024 + 1)])("contains a malformed web provider frame %#", async (frame) => {
    const { server, start } = safetySetup();
    expect((await start()).statusCode).toBe(200);
    expect(() => webSocketInstances[0]!.emit("message", Buffer.from(frame))).not.toThrow();
    await vi.waitFor(() => expect(completeVoiceCallMock).toHaveBeenCalledWith(expect.objectContaining({ disposition: "provider_frame_failed" })));
    expect(webSocketInstances[0]!.close).toHaveBeenCalledTimes(1);
    await server.close();
  });

  it("rejects implicit localhost origins in cloud mode", async () => {
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.WEB_CALL_ALLOWED_ORIGINS = "https://lobbystack.com";
    const server = createServer();

    const response = await server.inject({
      method: "OPTIONS",
      url: "/web-call/sessions",
      headers: {
        origin: "http://localhost:4321",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects localhost origins in cloud mode when allowed origins are unset", async () => {
    process.env.DEPLOYMENT_MODE = "cloud";
    delete process.env.WEB_CALL_ALLOWED_ORIGINS;
    const server = createServer();

    const response = await server.inject({
      method: "OPTIONS",
      url: "/web-call/sessions",
      headers: {
        origin: "http://localhost:4321",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows localhost origins in cloud mode only when explicitly configured", async () => {
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.WEB_CALL_ALLOWED_ORIGINS =
      "https://lobbystack.com,http://localhost:4321";
    const server = createServer();

    const response = await server.inject({
      method: "OPTIONS",
      url: "/web-call/sessions",
      headers: {
        origin: "http://localhost:4321",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:4321",
    );
  });

  it("rejects unsigned calls for business slugs that are not configured as public", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "other-business",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "A signed web call authorization is required.",
    });
    expect(fetchWebVoiceContextMock).not.toHaveBeenCalled();
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
  });

  it("does not trust a caller-supplied widget identity for a non-public business", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "other-business",
        widgetId: "lobbystack-landing",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(fetchWebVoiceContextMock).not.toHaveBeenCalled();
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
  });

  it("rejects an unprepared voice snapshot before opening a provider call", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: null });
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);
    const server = createServer();
    const response = await server.inject({
      method: "POST", url: "/web-call/sessions",
      headers: { origin: "https://lobbystack.com", "x-widget-parent-origin": "https://customer.example", "content-type": "application/json" },
      payload: { businessSlug: "other-business", widgetSessionToken: "signed-widget-session", sdp: "v=0" },
    });
    expect(response.statusCode).toBe(503);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
    await server.close();
  });

  it("allows a signed widget session for a non-public business", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "x-widget-parent-origin": "https://customer.example",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "other-business",
        widgetId: "lobbystack-widget",
        visitorId: "visitor-123",
        widgetSessionToken: "signed-widget-session",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchWebVoiceContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "other-business",
        origin: "https://customer.example",
        visitorId: "visitor-123",
        widgetSessionToken: "signed-widget-session",
      }),
    );
    expect(startWebVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "other-business",
        widgetSessionToken: "signed-widget-session",
      }),
    );
  });

  it("requires an SDP offer", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchWebVoiceContextMock).not.toHaveBeenCalled();
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
  });

  it("rejects malformed web call session fields before runtime requests", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: 123,
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchWebVoiceContextMock).not.toHaveBeenCalled();
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
  });

  it("does not rate limit syntactically invalid start attempts", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    for (let index = 0; index < 13; index += 1) {
      const invalidResponse = await server.inject({
        method: "POST",
        url: "/web-call/sessions",
        headers: {
          origin: "https://lobbystack.com",
          "content-type": "application/json",
        },
        payload: {
          businessSlug: "lobbystack",
        },
      });
      expect(invalidResponse.statusCode).toBe(400);
    }

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("applies a gateway rate limit before runtime requests", async () => {
    const server = createServer();

    for (let index = 0; index < 100; index += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/web-call/sessions",
        headers: {
          origin: "https://lobbystack.com",
          "content-type": "application/json",
        },
        payload: {
          businessSlug: "lobbystack",
        },
      });
      expect(response.statusCode).toBe(400);
    }

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
      },
    });

    expect(response.statusCode).toBe(429);
    expect(fetchWebVoiceContextMock).not.toHaveBeenCalled();
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
  });

  it("connects the web sideband websocket to the returned OpenAI call ID", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(webSocketInstances[0]?.url).toBe(
      "wss://api.openai.com/v1/realtime?call_id=rtc_test",
    );
  });

  it("contains prompt configuration failures to the affected web call", async () => {
    const configurationError = new Error("runtime tokenizer unavailable");
    buildVoiceSystemPromptMock.mockImplementationOnce(() => {
      throw configurationError;
    });
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    completeVoiceCallMock.mockResolvedValueOnce(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })).mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(() => webSocketInstances[0]?.emit("open")).not.toThrow();
    await vi.waitFor(() => expect(completeVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_123",
        disposition: "provider_session_configuration_failed",
      }),
    ));
    expect(capturePostHogExceptionMock).toHaveBeenCalledWith(
      configurationError,
      expect.objectContaining({
        properties: expect.objectContaining({
          operation: "web_call_session_configuration",
        }),
      }),
    );
  });

  it("retries durable cleanup after a prompt configuration failure", async () => {
    buildVoiceSystemPromptMock.mockImplementationOnce(() => {
      throw new Error("runtime tokenizer unavailable");
    });
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    completeVoiceCallMock
      .mockRejectedValueOnce(new Error("temporary backend failure"))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })).mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(200);
    webSocketInstances[0]?.emit("open");
    await vi.waitFor(
      () => expect(completeVoiceCallMock).toHaveBeenCalledTimes(2),
      { timeout: 1_000 },
    );
    expect(completeVoiceCallMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        callId: "call_123",
        disposition: "provider_session_configuration_failed",
      }),
    );
  });

  it("preserves caller audio when speech interrupts the opening greeting", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(200);
    const socket = webSocketInstances[0]!;
    socket.emit("open");
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "input_audio_buffer.speech_started" }),
      ),
    );
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.done",
          response: { id: "interrupted-greeting", status: "cancelled" },
        }),
      ),
    );
    await vi.waitFor(() => expect(captureAiGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "business_123",
        callId: "call_123",
        conversationId: "conversation_123",
        isStreaming: true,
        isError: false,
        properties: {
          channel: "web_voice",
          operation: "web_voice.response_generation",
        },
      }),
    ));
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "input_audio_buffer.speech_stopped" }),
      ),
    );

    const sentMessages = socket.send.mock.calls.map(([value]) =>
      JSON.parse(String(value)) as {
        type?: string;
        session?: {
          audio?: {
            input?: {
              turn_detection?: Record<string, unknown>;
            };
          };
        };
      },
    );
    const sessionUpdates = sentMessages.filter(
      (message) => message.type === "session.update",
    );

    expect(
      sessionUpdates[0]?.session?.audio?.input?.turn_detection,
    ).toMatchObject({
      type: "server_vad",
      create_response: false,
      interrupt_response: false,
    });
    expect(
      sessionUpdates[1]?.session?.audio?.input?.turn_detection,
    ).toMatchObject({
      type: "server_vad",
      create_response: true,
      interrupt_response: true,
    });
    expect(sentMessages).toContainEqual({ type: "response.cancel" });
    expect(sentMessages).toContainEqual({ type: "output_audio_buffer.clear" });
    expect(sentMessages.at(-1)).toEqual({ type: "response.create" });
    expect(sentMessages).not.toContainEqual({ type: "input_audio_buffer.clear" });
  });

  it("times an automatic VAD response from provider creation through completion", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();
    await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: { origin: "https://lobbystack.com", "content-type": "application/json" },
      payload: { businessSlug: "lobbystack", sdp: "v=0" },
    });
    const socket = webSocketInstances[0]!;
    socket.emit("open");
    // Finish the explicit greeting first. Once VAD is enabled, OpenAI creates
    // ordinary caller-turn responses without a response.create from us.
    socket.emit("message", Buffer.from(JSON.stringify({
      type: "response.created",
      response: { id: "opening-greeting" },
    })));
    socket.emit("message", Buffer.from(JSON.stringify({
      type: "response.done",
      response: { id: "opening-greeting", status: "completed" },
    })));
    await vi.waitFor(() => expect(captureAiGenerationMock).toHaveBeenCalled());
    captureAiGenerationMock.mockClear();

    const now = vi.spyOn(Date, "now");
    try {
      socket.emit("message", Buffer.from(JSON.stringify({
        type: "input_audio_buffer.speech_stopped",
      })));
      now.mockReturnValue(1_000);
      socket.emit("message", Buffer.from(JSON.stringify({
        type: "response.created",
        response: { id: "automatic-response" },
      })));
      now.mockReturnValue(1_275);
      socket.emit("message", Buffer.from(JSON.stringify({
        type: "response.done",
        response: {
          id: "automatic-response",
          status: "completed",
          usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
        },
      })));

      await vi.waitFor(() => expect(captureAiGenerationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: "call_123",
          latencyMs: 275,
          inputTokens: 11,
          outputTokens: 7,
        }),
      ));
    } finally {
      now.mockRestore();
    }
  });

  it("does not forward prospect demo bearer URLs to call storage", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({
      snapshot: demoSnapshot,
      sessionMode: "prospect_demo",
      prospectDemoId: "demo_123",
    });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "prospect-acme",
        pageUrl: "https://app.lobbystack.com/demo/acme-secret-token",
        prospectDemoToken: "acme-secret-token",
        sdp: "v=0",
        visitorId: "visitor-123",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(startWebVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prospectDemoToken: "acme-secret-token",
      }),
    );
    expect(startWebVoiceCallMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "originUrl",
    );
  });

  it("instructs the web sideband to retrieve product facts before answering", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(200);
    webSocketInstances[0]?.emit("open");

    const sentMessages = webSocketInstances[0]?.send.mock.calls.map(
      (call) => JSON.parse(String(call[0])) as Record<string, unknown>,
    );
    const sessionUpdate = sentMessages?.find(
      (message) => message.type === "session.update",
    ) as {
      session?: {
        instructions?: string;
        tools?: Array<{ name?: string; description?: string }>;
      };
    };
    const searchKnowledge = sessionUpdate.session?.tools?.find(
      (tool) => tool.name === "searchKnowledge",
    );

    expect(sessionUpdate.session?.instructions).toContain(
      "For every business-specific factual question",
    );
    expect(sessionUpdate.session?.instructions).toContain(
      "use searchKnowledge before answering",
    );
    expect(searchKnowledge?.description).toContain(
      "course names, exact course codes, products, policies, prices, and document facts",
    );
  });

  it("creates OpenAI web calls with multipart SDP and session config", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response("answer-sdp", {
        status: 200,
        headers: { location: "/v1/realtime/calls/rtc_test" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0\r\n",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-openai-key",
        },
      }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.body).toBeInstanceOf(FormData);
    const formData = requestInit?.body as FormData;
    expect(formData.get("sdp")).toBe("v=0\r\n");
    expect(JSON.parse(String(formData.get("session")))).toEqual({
      type: "realtime",
      model: "gpt-realtime-2.1",
      audio: {
        output: {
          voice: "marin",
        },
      },
    });
  });

  it("returns durable backend rate limits before starting an OpenAI web call", async () => {
    fetchWebVoiceContextMock.mockRejectedValueOnce(
      new runtimeRequestErrorClass({
        message: "Too many web voice starts. Please try again shortly.",
        status: 429,
        code: "web_voice_rate_limited",
      }),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
        visitorId: "visitor-123",
        widgetId: "lobbystack-landing",
      },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      code: "web_voice_rate_limited",
      error: "Too many web voice starts. Please try again shortly.",
    });
    expect(fetchWebVoiceContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "lobbystack",
        origin: "https://lobbystack.com",
        visitorId: "visitor-123",
        widgetId: "lobbystack-landing",
      }),
    );
    expect(fetchWebVoiceContextMock.mock.calls[0]?.[0].ipHash).toHaveLength(64);
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
  });

  it("returns billing preflight failures before starting an OpenAI web call", async () => {
    fetchWebVoiceContextMock.mockRejectedValueOnce(
      new runtimeRequestErrorClass({
        message: "Voice quota reached for this billing period.",
        status: 402,
        code: "voice_limit_reached",
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toEqual({
      code: "voice_limit_reached",
      error: "Voice quota reached for this billing period.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
  });

  it("does not forward dashboard test call tokens from public widget starts", async () => {
    process.env.WEB_CALL_ALLOWED_ORIGINS = "https://app.lobbystack.com";
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://app.lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
        visitorId: "visitor-123",
        widgetId: "lobbystack-dashboard-test-call",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchWebVoiceContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "lobbystack",
        origin: "https://app.lobbystack.com",
        visitorId: "visitor-123",
        widgetId: "lobbystack-dashboard-test-call",
      }),
    );
    expect(fetchWebVoiceContextMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "dashboardTestCallToken",
    );
  });

  it("preserves dashboard authorization and origin through knowledge tool execution", async () => {
    process.env.WEB_CALL_ALLOWED_ORIGINS = "https://app.lobbystack.com";
    process.env.DASHBOARD_TEST_CALL_TOKEN = "dashboard-token";
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://app.lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        dashboardTestCallProof: createDashboardTestCallProof({
          businessSlug: "lobbystack",
          token: "dashboard-token",
        }),
        sdp: "v=0",
        visitorId: "visitor-123",
        widgetId: "lobbystack-dashboard-test-call",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchWebVoiceContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "lobbystack",
        dashboardTestCallToken: "dashboard-token",
        origin: "https://app.lobbystack.com",
        visitorId: "visitor-123",
        widgetId: "lobbystack-dashboard-test-call",
      }),
    );
    expect(startWebVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: "lobbystack",
        dashboardTestCallToken: "dashboard-token",
        ipHash: expect.any(String),
        visitorId: "visitor-123",
        widgetId: "lobbystack-dashboard-test-call",
      }),
    );
    fetchWebVoiceContextMock.mockImplementation(async (input) => {
      if (input.origin !== "https://app.lobbystack.com") {
        throw new Error("Web voice origin is required.");
      }
      return { snapshot: demoSnapshot };
    });
    searchVoiceKnowledgeMock.mockResolvedValueOnce({
      outcome: "found", mode: "hybrid",
      matches: [{ text: "Management: MNGT 10407", documentId: "course-document" }],
    });
    const socket = webSocketInstances[0]!;
    socket.emit("open");
    socket.emit("message", Buffer.from(JSON.stringify({
      type: "response.function_call_arguments.done",
      name: "searchKnowledge", call_id: "knowledge-call",
      arguments: JSON.stringify({ query: "management BAA" }),
    })));
    await vi.waitFor(() => expect(searchVoiceKnowledgeMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "business_123", callId: "call_123", query: "management BAA" }),
    ));
    await vi.waitFor(() => expect(socket.send.mock.calls.map(([value]) => JSON.parse(String(value))))
      .toContainEqual(expect.objectContaining({
        type: "conversation.item.create",
        item: expect.objectContaining({
          type: "function_call_output", call_id: "knowledge-call",
          output: expect.stringContaining("MNGT 10407"),
        }),
      })));
  });

  it("derives matching dashboard authorization from the internal token in development", async () => {
    process.env.WEB_CALL_ALLOWED_ORIGINS = "http://localhost:3000";
    const derivedToken = createHmac("sha256", "test-service-token")
      .update("lobbystack:dashboard-test-call:development")
      .digest("hex");
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("answer-sdp", {
      status: 200,
      headers: { location: "/v1/realtime/calls/rtc_test" },
    })));
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      payload: {
        businessSlug: "private-business",
        dashboardTestCallProof: createDashboardTestCallProof({ businessSlug: "private-business", token: derivedToken }),
        sdp: "v=0",
        widgetId: "lobbystack-dashboard-test-call",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchWebVoiceContextMock).toHaveBeenCalledWith(expect.objectContaining({
      businessSlug: "private-business",
      dashboardTestCallToken: derivedToken,
    }));
  });

  it("forwards dashboard test call tokens during tool context fetches", async () => {
    process.env.WEB_CALL_ALLOWED_ORIGINS = "https://app.lobbystack.com";
    process.env.DASHBOARD_TEST_CALL_TOKEN = "dashboard-token";
    fetchWebVoiceContextMock
      .mockResolvedValueOnce({ snapshot: demoSnapshot })
      .mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    takeVoiceMessageMock.mockResolvedValueOnce({ inboxItemId: "inbox_123" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://app.lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        dashboardTestCallProof: createDashboardTestCallProof({
          businessSlug: "lobbystack",
          token: "dashboard-token",
        }),
        sdp: "v=0",
        visitorId: "visitor-123",
        widgetId: "lobbystack-dashboard-test-call",
      },
    });

    expect(createResponse.statusCode).toBe(200);
    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "takeMessage",
          call_id: "tool-call-1",
          arguments: JSON.stringify({
            callbackPhone: "+14165550123",
            message: "Please call me tomorrow.",
          }),
        }),
      ),
    );

    await vi.waitFor(() => {
      expect(fetchWebVoiceContextMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchWebVoiceContextMock.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        businessSlug: "lobbystack",
        dashboardTestCallToken: "dashboard-token",
      }),
    );
  });

  it("does not trust spoofed forwarded IP headers by default", async () => {
    fetchWebVoiceContextMock
      .mockResolvedValueOnce({ snapshot: demoSnapshot })
      .mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock
      .mockResolvedValueOnce({
        businessId: "business_123",
        callId: "call_123",
        conversationId: "conversation_123",
      })
      .mockResolvedValueOnce({
        businessId: "business_123",
        callId: "call_456",
        conversationId: "conversation_456",
      });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("answer-sdp", {
            status: 200,
            headers: { location: "/v1/realtime/calls/rtc_test_1" },
          }),
        )
        .mockResolvedValueOnce(
          new Response("answer-sdp", {
            status: 200,
            headers: { location: "/v1/realtime/calls/rtc_test_2" },
          }),
        ),
    );
    const server = createServer();

    for (const forwardedFor of ["203.0.113.10", "198.51.100.77"]) {
      const response = await server.inject({
        method: "POST",
        url: "/web-call/sessions",
        headers: {
          origin: "https://lobbystack.com",
          "content-type": "application/json",
          "x-forwarded-for": forwardedFor,
        },
        payload: {
          businessSlug: "lobbystack",
          sdp: "v=0",
        },
      });

      expect(response.statusCode).toBe(200);
    }

    expect(fetchWebVoiceContextMock.mock.calls[0]?.[0].ipHash).toBe(
      fetchWebVoiceContextMock.mock.calls[1]?.[0].ipHash,
    );
  });

  it("derives distinct client keys from the opted-in ingress header and ignores forwarded-for", async () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = "x-real-ip";
    // Even with proxy trust enabled, only the opted-in single-value header is
    // used; the caller-controlled x-forwarded-for hop is irrelevant.
    process.env.VOICE_GATEWAY_TRUST_PROXY = "true";
    fetchWebVoiceContextMock
      .mockResolvedValueOnce({ snapshot: demoSnapshot })
      .mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock
      .mockResolvedValueOnce({
        businessId: "business_123",
        callId: "call_123",
        conversationId: "conversation_123",
      })
      .mockResolvedValueOnce({
        businessId: "business_123",
        callId: "call_456",
        conversationId: "conversation_456",
      });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("answer-sdp", {
            status: 200,
            headers: { location: "/v1/realtime/calls/rtc_test_1" },
          }),
        )
        .mockResolvedValueOnce(
          new Response("answer-sdp", {
            status: 200,
            headers: { location: "/v1/realtime/calls/rtc_test_2" },
          }),
        ),
    );
    const server = createServer();

    const clients = [
      { realIp: "203.0.113.10", forwardedFor: "10.0.0.1" },
      { realIp: "198.51.100.77", forwardedFor: "10.0.0.1" },
    ];
    for (const client of clients) {
      const response = await server.inject({
        method: "POST",
        url: "/web-call/sessions",
        remoteAddress: "198.51.100.200",
        headers: {
          origin: "https://lobbystack.com",
          "content-type": "application/json",
          "x-real-ip": client.realIp,
          // Same injected leftmost hop for both clients must not affect the key.
          "x-forwarded-for": client.forwardedFor,
        },
        payload: {
          businessSlug: "lobbystack",
          sdp: "v=0",
        },
      });

      expect(response.statusCode).toBe(200);
    }

    const firstHash = fetchWebVoiceContextMock.mock.calls[0]?.[0].ipHash;
    const secondHash = fetchWebVoiceContextMock.mock.calls[1]?.[0].ipHash;
    expect(firstHash).toHaveLength(64);
    expect(secondHash).toHaveLength(64);
    expect(firstHash).not.toBe(secondHash);
    expect(firstHash).toBe(
      createHash("sha256").update("test-service-token:203.0.113.10").digest("hex"),
    );
    expect(secondHash).toBe(
      createHash("sha256").update("test-service-token:198.51.100.77").digest("hex"),
    );
  });

  it("fails closed to one shared key when the configured ingress header is absent or invalid", async () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = "x-real-ip";
    fetchWebVoiceContextMock
      .mockResolvedValueOnce({ snapshot: demoSnapshot })
      .mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock
      .mockResolvedValueOnce({
        businessId: "business_123",
        callId: "call_123",
        conversationId: "conversation_123",
      })
      .mockResolvedValueOnce({
        businessId: "business_123",
        callId: "call_456",
        conversationId: "conversation_456",
      });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("answer-sdp", {
            status: 200,
            headers: { location: "/v1/realtime/calls/rtc_test_1" },
          }),
        )
        .mockResolvedValueOnce(
          new Response("answer-sdp", {
            status: 200,
            headers: { location: "/v1/realtime/calls/rtc_test_2" },
          }),
        ),
    );
    const server = createServer();

    for (const xRealIp of [undefined, "not-an-ip"]) {
      const response = await server.inject({
        method: "POST",
        url: "/web-call/sessions",
        headers: {
          origin: "https://lobbystack.com",
          "content-type": "application/json",
          ...(xRealIp === undefined ? {} : { "x-real-ip": xRealIp }),
          // A forged forwarded-for hop must not rescue attribution.
          "x-forwarded-for": "203.0.113.10",
        },
        payload: {
          businessSlug: "lobbystack",
          sdp: "v=0",
        },
      });

      expect(response.statusCode).toBe(200);
    }

    const sharedHash = createHash("sha256")
      .update(`test-service-token:${UNATTRIBUTABLE_CLIENT_IP}`)
      .digest("hex");
    expect(fetchWebVoiceContextMock.mock.calls[0]?.[0].ipHash).toBe(sharedHash);
    expect(fetchWebVoiceContextMock.mock.calls[1]?.[0].ipHash).toBe(sharedHash);
  });

  it("ignores spoofed forwarded IP headers from untrusted direct clients", async () => {
    process.env.VOICE_GATEWAY_TRUST_PROXY = "true";
    fetchWebVoiceContextMock
      .mockResolvedValueOnce({ snapshot: demoSnapshot })
      .mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock
      .mockResolvedValueOnce({
        businessId: "business_123",
        callId: "call_123",
        conversationId: "conversation_123",
      })
      .mockResolvedValueOnce({
        businessId: "business_123",
        callId: "call_456",
        conversationId: "conversation_456",
      });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("answer-sdp", {
            status: 200,
            headers: { location: "/v1/realtime/calls/rtc_test_1" },
          }),
        )
        .mockResolvedValueOnce(
          new Response("answer-sdp", {
            status: 200,
            headers: { location: "/v1/realtime/calls/rtc_test_2" },
          }),
        ),
    );
    const server = createServer();

    for (const forwardedFor of ["203.0.113.10", "198.51.100.77"]) {
      const response = await server.inject({
        method: "POST",
        url: "/web-call/sessions",
        remoteAddress: "198.51.100.10",
        headers: {
          origin: "https://lobbystack.com",
          "content-type": "application/json",
          "x-forwarded-for": forwardedFor,
        },
        payload: {
          businessSlug: "lobbystack",
          sdp: "v=0",
        },
      });

      expect(response.statusCode).toBe(200);
    }

    expect(fetchWebVoiceContextMock.mock.calls[0]?.[0].ipHash).toBe(
      fetchWebVoiceContextMock.mock.calls[1]?.[0].ipHash,
    );
  });

  it("treats an unknown session end as idempotent", async () => {
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions/session-missing/end",
      headers: {
        origin: "https://lobbystack.com",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(fetchWebCallRecordingTargetMock).toHaveBeenCalledWith({
      gatewaySessionId: "session-missing",
    });
    expect(completeVoiceCallMock).not.toHaveBeenCalled();
  });

  it("finalizes durable web calls when the in-memory session is missing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const startedAtMs = Date.now();
    const mediaStartedAtMs = startedAtMs + 5_000;
    vi.setSystemTime(mediaStartedAtMs + 2_000);
    fetchWebCallRecordingTargetMock.mockResolvedValueOnce({
      callId: "call_durable_end",
      providerCallId: "rtc_durable",
      startedAt: new Date(startedAtMs).toISOString(),
      mediaStartedAt: new Date(mediaStartedAtMs).toISOString(),
      status: "open",
    });
    completeVoiceCallMock.mockResolvedValueOnce(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions/session-durable/end",
      headers: {
        origin: "https://lobbystack.com",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(fetchWebCallRecordingTargetMock).toHaveBeenCalledWith({
      gatewaySessionId: "session-durable",
    });
    expect(completeVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_durable_end",
        status: "completed",
        disposition: "caller_finished",
        providerDurationSeconds: 2,
        mediaDurationSeconds: 2,
      }),
    );
  });

  it("leaves a durable web call without media-start evidence for reconciliation", async () => {
    fetchWebCallRecordingTargetMock.mockResolvedValueOnce({
      callId: "call_durable_without_media",
      providerCallId: "rtc_durable_without_media",
      startedAt: new Date(Date.now() - 5_000).toISOString(),
      status: "started",
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions/session-without-media/end",
      headers: { origin: "https://lobbystack.com" },
    });

    expect(response.statusCode).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(completeVoiceCallMock).not.toHaveBeenCalled();
    await server.close();
  });

  it("hangs up OpenAI and completes the call after the max web call duration", async () => {
    process.env.WEB_CALL_MAX_DURATION_MS = "1";
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    completeVoiceCallMock.mockResolvedValueOnce(null);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
        visitorId: "visitor-123",
        widgetId: "lobbystack-landing",
      },
    });

    expect(response.statusCode).toBe(200);

    await vi.waitFor(() => {
      expect(completeVoiceCallMock).toHaveBeenCalled();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.openai.com/v1/realtime/calls/rtc_test/hangup",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-openai-key",
        },
      }),
    );
    expect(completeVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_123",
        status: "completed",
        disposition: "duration_limit",
        providerDurationSeconds: expect.any(Number),
      }),
    );
    expect(webSocketInstances[0]?.close).toHaveBeenCalled();
  });

  it("does not bill provider setup latency as web call media duration", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const setupStartedAtMs = Date.now();
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    // Provider setup (here the provider binding) takes five seconds after the
    // provider was allocated. That latency must not reach the billed duration.
    bindWebVoiceProviderMock.mockImplementationOnce(async () => {
      vi.setSystemTime(setupStartedAtMs + 5_000);
    });
    completeVoiceCallMock.mockResolvedValueOnce(null);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: { businessSlug: "lobbystack", sdp: "v=0" },
    });
    expect(createResponse.statusCode).toBe(200);

    await server.inject({
      method: "POST",
      url: `/web-call/sessions/${createResponse.json().sessionId}/end`,
      headers: { origin: "https://lobbystack.com" },
    });

    expect(completeVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_123",
        providerDurationSeconds: 0,
        mediaDurationSeconds: 0,
      }),
    );
    await server.close();
  });

  it("measures the web call max duration from media start, not the durable reservation", async () => {
    process.env.WEB_CALL_MAX_DURATION_MS = "30000";
    vi.useFakeTimers({ toFake: ["Date"] });
    const setupStartedAtMs = Date.now();
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    // Forty-five seconds of setup would already exceed the thirty second max
    // duration if the timer were measured from the early durable reservation.
    bindWebVoiceProviderMock.mockImplementationOnce(async () => {
      vi.setSystemTime(setupStartedAtMs + 45_000);
    });
    completeVoiceCallMock.mockResolvedValueOnce(null);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: { businessSlug: "lobbystack", sdp: "v=0" },
    });
    expect(createResponse.statusCode).toBe(200);

    // A durable-reservation clock would have already exhausted the budget and
    // hung up immediately; the media clock still has its full window to run.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(completeVoiceCallMock).not.toHaveBeenCalled();
    await server.close();
  });

  it("excludes pre-allocation latency from provider setup failure compensation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const requestStartedAtMs = Date.now();
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    // Four seconds elapse inside the allocation request before the provider is
    // actually allocated, then binding fails immediately. Only post-allocation
    // provider time may be compensated.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        vi.setSystemTime(requestStartedAtMs + 4_000);
        return new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        });
      })
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    bindWebVoiceProviderMock.mockRejectedValueOnce(
      new Error("binding unavailable"),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: { businessSlug: "lobbystack", sdp: "v=0" },
    });

    expect(response.statusCode).toBe(500);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("rtc_test/hangup"),
      expect.anything(),
    );
    expect(completeVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        disposition: "provider_setup_failed",
        providerDurationSeconds: 0,
        mediaDurationSeconds: 0,
      }),
    );
    await server.close();
  });

  it("uploads browser web call recordings for completed sessions", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    uploadVoiceRecordingMock.mockResolvedValueOnce(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })).mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });
    const { sessionId } = createResponse.json() as { sessionId: string };

    await server.inject({
      method: "POST",
      url: `/web-call/sessions/${sessionId}/end`,
      headers: { origin: "https://lobbystack.com" },
    });

    const response = await server.inject({
      method: "POST",
      url: `/web-call/sessions/${sessionId}/recording?durationMs=1234`,
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "audio/webm",
      },
      payload: Buffer.from("webm-recording"),
    });

    expect(response.statusCode).toBe(204);
    expect(uploadVoiceRecordingMock).toHaveBeenCalledWith({
      callId: "call_123",
      durationMs: expect.any(Number),
      audio: Buffer.from("webm-recording"),
      contentType: "audio/webm",
    });
  });

  it("accepts browser recordings over Fastify's default body limit", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    uploadVoiceRecordingMock.mockResolvedValueOnce(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })).mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });
    const { sessionId } = createResponse.json() as { sessionId: string };
    const recording = Buffer.alloc(1024 * 1024 + 1, 1);

    await server.inject({
      method: "POST",
      url: `/web-call/sessions/${sessionId}/end`,
      headers: { origin: "https://lobbystack.com" },
    });

    const response = await server.inject({
      method: "POST",
      url: `/web-call/sessions/${sessionId}/recording?durationMs=1234`,
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "audio/webm",
      },
      payload: recording,
    });

    expect(response.statusCode).toBe(204);
    expect(uploadVoiceRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_123",
        audio: expect.any(Buffer),
      }),
    );
    expect(uploadVoiceRecordingMock.mock.calls[0]?.[0].audio).toHaveLength(
      recording.length,
    );
  });

  it("orders delayed caller transcripts before the matching assistant reply", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    appendVoiceTranscriptMock.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(200);
    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.output_audio_transcript.done",
          item_id: "greeting-item-1",
          content_index: 0,
          transcript: "Thanks for calling LobbyStack QA. How can I help?",
        }),
      ),
    );
    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "response.done", response: { id: "greeting" } }),
      ),
    );

    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.output_audio_transcript.done",
          item_id: "assistant-item-1",
          content_index: 0,
          transcript: "I can help with that.",
        }),
      ),
    );
    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          item_id: "caller-item-1",
          content_index: 0,
          transcript: "I need help booking an appointment.",
        }),
      ),
    );

    await vi.waitFor(() => {
      expect(appendVoiceTranscriptMock).toHaveBeenCalledTimes(3);
    });
    expect(appendVoiceTranscriptMock).toHaveBeenNthCalledWith(1, {
      businessId: "business_123",
      callId: "call_123",
      sequence: 1,
      speaker: "assistant",
      text: "Thanks for calling LobbyStack QA. How can I help?",
      final: true,
    });
    expect(appendVoiceTranscriptMock).toHaveBeenNthCalledWith(2, {
      businessId: "business_123",
      callId: "call_123",
      sequence: 2,
      speaker: "caller",
      text: "I need help booking an appointment.",
      final: true,
    });
    expect(appendVoiceTranscriptMock).toHaveBeenNthCalledWith(3, {
      businessId: "business_123",
      callId: "call_123",
      sequence: 3,
      speaker: "assistant",
      text: "I can help with that.",
      final: true,
    });
  });

  it("allows recording upload shortly after the web session ends", async () => {
    fetchWebVoiceContextMock.mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    completeVoiceCallMock.mockResolvedValueOnce(null);
    uploadVoiceRecordingMock.mockResolvedValueOnce(null);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });
    const { sessionId } = createResponse.json() as { sessionId: string };

    await server.inject({
      method: "POST",
      url: `/web-call/sessions/${sessionId}/end`,
      headers: { origin: "https://lobbystack.com" },
    });

    const response = await server.inject({
      method: "POST",
      url: `/web-call/sessions/${sessionId}/recording?durationMs=1234`,
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "audio/webm",
      },
      payload: Buffer.from("webm-recording"),
    });

    expect(response.statusCode).toBe(204);
    expect(uploadVoiceRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_123",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("clamps reported recording duration to the actual web call window", async () => {
    const endedAtMs = Date.now();
    fetchWebCallRecordingTargetMock.mockResolvedValueOnce({
      callId: "call_durable_clamped",
      startedAt: new Date(endedAtMs - 2_000).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      status: "completed",
    });
    uploadVoiceRecordingMock.mockResolvedValueOnce(null);
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions/gateway-session-durable-clamped/recording?durationMs=999999",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "audio/webm",
      },
      payload: Buffer.from("webm-recording"),
    });

    expect(response.statusCode).toBe(204);
    expect(uploadVoiceRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_durable_clamped",
        durationMs: 2_000,
      }),
    );
  });

  it("resolves recording uploads through the backend when the gateway session is not local", async () => {
    const endedAtMs = Date.now();
    fetchWebCallRecordingTargetMock.mockResolvedValueOnce({
      callId: "call_durable_123",
      startedAt: new Date(endedAtMs - 5 * 60 * 1000).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      status: "completed",
    });
    uploadVoiceRecordingMock.mockResolvedValueOnce(null);
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions/gateway-session-durable/recording",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "audio/webm",
      },
      payload: Buffer.from("webm-recording"),
    });

    expect(response.statusCode).toBe(204);
    expect(fetchWebCallRecordingTargetMock).toHaveBeenCalledWith({
      gatewaySessionId: "gateway-session-durable",
    });
    expect(uploadVoiceRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_durable_123",
        durationMs: 5 * 60 * 1000,
      }),
    );
  });

  it("rejects stale durable web recording targets", async () => {
    const startedAtMs = Date.now() - 7 * 60 * 1000;
    fetchWebCallRecordingTargetMock.mockResolvedValueOnce({
      callId: "call_durable_stale",
      startedAt: new Date(startedAtMs).toISOString(),
      status: "in_progress",
      webCallMaxDurationMs: 5 * 60 * 1000,
    });
    const server = createServer();

    const response = await server.inject({
      method: "POST",
      url: "/web-call/sessions/gateway-session-stale/recording",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "audio/webm",
      },
      payload: Buffer.from("webm-recording"),
    });

    expect(response.statusCode).toBe(404);
    expect(uploadVoiceRecordingMock).not.toHaveBeenCalled();
  });

  it("requests a final assistant message before ending an AI-directed web call", async () => {
    fetchWebVoiceContextMock
      .mockResolvedValueOnce({ snapshot: demoSnapshot })
      .mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    completeVoiceCallMock.mockResolvedValueOnce(null);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(createResponse.statusCode).toBe(200);
    vi.useFakeTimers();
    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "endCall",
          call_id: "tool-call-1",
          arguments: JSON.stringify({
            reason: "caller_finished",
            message: "Thanks for visiting. Goodbye.",
          }),
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(0);
    const sentMessages = webSocketInstances[0]?.send.mock.calls.map((call) =>
      JSON.parse(String(call[0])),
    );
    expect(sentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "response.create",
          response: expect.objectContaining({
            metadata: { lobbystack_purpose: "web_final_message" },
            tool_choice: "none",
          }),
        }),
      ]),
    );
    expect(completeVoiceCallMock).not.toHaveBeenCalled();

    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.done",
          response: {
            id: "final-response-1",
            status: "completed",
            metadata: { lobbystack_purpose: "web_final_message" },
          },
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(1_599);
    expect(completeVoiceCallMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(completeVoiceCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call_123",
        disposition: "caller_finished",
      }),
    );
  });

  it("passes web_voice when a website visitor leaves a message", async () => {
    fetchWebVoiceContextMock
      .mockResolvedValueOnce({ snapshot: demoSnapshot })
      .mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    takeVoiceMessageMock.mockResolvedValueOnce({ inboxItemId: "inbox_123" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(createResponse.statusCode).toBe(200);
    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "takeMessage",
          call_id: "tool-call-1",
          arguments: JSON.stringify({
            callbackPhone: "+14165550123",
            message: "Please call me tomorrow.",
          }),
        }),
      ),
    );

    await vi.waitFor(() => {
      expect(takeVoiceMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: "call_123",
          conversationId: "conversation_123",
          channel: "web_voice",
        }),
      );
    });
  });

  it("passes web_voice when a website visitor books an appointment", async () => {
    fetchWebVoiceContextMock
      .mockResolvedValueOnce({ snapshot: demoSnapshot })
      .mockResolvedValueOnce({ snapshot: demoSnapshot });
    startWebVoiceCallMock.mockResolvedValueOnce({
      businessId: "business_123",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    bookVoiceAppointmentMock.mockResolvedValueOnce({
      appointmentId: "appointment_123",
      contactId: "contact_123",
      serviceId: "service_123",
      serviceName: "Consultation",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("answer-sdp", {
          status: 200,
          headers: { location: "/v1/realtime/calls/rtc_test" },
        }),
      ),
    );
    const server = createServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/web-call/sessions",
      headers: {
        origin: "https://lobbystack.com",
        "content-type": "application/json",
      },
      payload: {
        businessSlug: "lobbystack",
        sdp: "v=0",
      },
    });

    expect(createResponse.statusCode).toBe(200);
    webSocketInstances[0]?.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "bookAppointment",
          call_id: "tool-call-1",
          arguments: JSON.stringify({
            serviceName: "Consultation",
            startsAt: "2030-05-15T14:00:00.000Z",
            contactPhone: "+14165550123",
            smsConsentGranted: true,
          }),
        }),
      ),
    );

    await vi.waitFor(() => {
      expect(bookVoiceAppointmentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: "business_123",
          conversationId: "conversation_123",
          channel: "web_voice",
        }),
      );
    });
  });
});
