import { createHmac } from "node:crypto";

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const {
  appendVoiceTranscriptMock,
  bookVoiceAppointmentMock,
  completeVoiceCallMock,
  fetchWebCallRecordingTargetMock,
  fetchWebVoiceContextMock,
  runtimeRequestErrorClass,
  startWebVoiceCallMock,
  takeVoiceMessageMock,
  uploadVoiceRecordingMock,
  webSocketInstances,
} = vi.hoisted(() => ({
  appendVoiceTranscriptMock: vi.fn(),
  bookVoiceAppointmentMock: vi.fn(),
  completeVoiceCallMock: vi.fn(),
  fetchWebCallRecordingTargetMock: vi.fn(),
  fetchWebVoiceContextMock: vi.fn(),
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
  takeVoiceMessageMock: vi.fn(),
  uploadVoiceRecordingMock: vi.fn(),
  webSocketInstances: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: Array<unknown>) => void;
    options: unknown;
    send: ReturnType<typeof vi.fn>;
    url: string | URL;
  }>,
}));

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

vi.mock("../convex/runtimeClient", () => ({
  appendVoiceTranscript: appendVoiceTranscriptMock,
  completeVoiceCall: completeVoiceCallMock,
  fetchWebCallRecordingTarget: fetchWebCallRecordingTargetMock,
  fetchWebVoiceContext: fetchWebVoiceContextMock,
  recordVoiceAiCost: vi.fn(),
  RuntimeRequestError: runtimeRequestErrorClass,
  startWebVoiceCall: startWebVoiceCallMock,
  uploadVoiceRecording: uploadVoiceRecordingMock,
  bookVoiceAppointment: bookVoiceAppointmentMock,
  cancelVoiceAppointment: vi.fn(),
  checkVoiceAvailability: vi.fn(),
  findVoiceAvailability: vi.fn(),
  lookupVoiceAppointmentForChange: vi.fn(),
  rescheduleVoiceAppointment: vi.fn(),
  searchVoiceKnowledge: vi.fn(),
  sendVoiceAppointmentChangeOtp: vi.fn(),
  takeVoiceMessage: takeVoiceMessageMock,
  updateVoiceTransferState: vi.fn(),
  verifyVoiceAppointmentChangeOtp: vi.fn(),
  verifyVoiceAppointmentForChange: vi.fn(),
}));

import { demoSnapshot } from "@lobbystack/shared";

import { createServer } from "../http/server";
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
  it("can disable auto responses and interruptions during the opening greeting", () => {
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

  it("defaults to normal web caller turn handling after the greeting", () => {
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
    process.env.DEPLOYMENT_MODE = "development";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
    process.env.CONVEX_SITE_URL = "https://convex.example.com";
    process.env.INTERNAL_SERVICE_TOKEN = "test-service-token";
    process.env.TWILIO_AUTH_TOKEN = "twilio-auth-token";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.WEB_CALL_ALLOWED_ORIGINS = "https://lobbystack.com";
  });

  afterEach(() => {
    resetWebCallRouteStateForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    webSocketInstances.length = 0;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VOICE_GATEWAY_TRUST_PROXY;
    delete process.env.WEB_CALL_ALLOWED_ORIGINS;
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

  it("returns Convex lookup failures for unknown public widget business slugs", async () => {
    fetchWebVoiceContextMock.mockRejectedValueOnce(
      new runtimeRequestErrorClass({
        message: "Not found",
        status: 404,
      }),
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
        businessSlug: "other-business",
        sdp: "v=0",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(fetchWebVoiceContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessSlug: "other-business" }),
    );
    expect(startWebVoiceCallMock).not.toHaveBeenCalled();
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

  it("instructs the web sideband to retrieve product facts silently before answering", async () => {
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
      "feature, workflow, policy, limitation, pricing, usage, billing, integration",
    );
    expect(sessionUpdate.session?.instructions).toContain(
      "Do not tell the visitor you are searching, checking, or looking something up.",
    );
    expect(searchKnowledge?.description).toContain(
      "capabilities, workflows, policies, limits, pricing, billing, usage, integrations",
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
      model: "gpt-realtime",
      audio: {
        output: {
          voice: "marin",
        },
      },
    });
  });

  it("returns durable Convex rate limits before starting an OpenAI web call", async () => {
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

  it("injects dashboard test call tokens for signed dashboard widget starts", async () => {
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

  it("uses trusted forwarded IP headers when proxy trust is enabled", async () => {
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

    expect(fetchWebVoiceContextMock.mock.calls[0]?.[0].ipHash).toHaveLength(64);
    expect(fetchWebVoiceContextMock.mock.calls[0]?.[0].ipHash).not.toBe(
      fetchWebVoiceContextMock.mock.calls[1]?.[0].ipHash,
    );
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
    const startedAtMs = Date.now();
    fetchWebCallRecordingTargetMock.mockResolvedValueOnce({
      callId: "call_durable_end",
      startedAt: new Date(startedAtMs).toISOString(),
      status: "open",
    });
    completeVoiceCallMock.mockResolvedValueOnce(null);
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
        providerDurationSeconds: expect.any(Number),
      }),
    );
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
    expect(webSocketInstances[0]?.close).toHaveBeenCalledWith(
      1000,
      "web call ended",
    );
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
    await new Promise((resolve) => setTimeout(resolve, 2_050));

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

  it("resolves recording uploads through Convex when the gateway session is not local", async () => {
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
