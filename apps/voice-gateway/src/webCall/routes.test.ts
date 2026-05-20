import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const {
  appendVoiceTranscriptMock,
  completeVoiceCallMock,
  fetchWebVoiceContextMock,
  runtimeRequestErrorClass,
  startWebVoiceCallMock,
  uploadVoiceRecordingMock,
  webSocketInstances,
} = vi.hoisted(() => ({
  appendVoiceTranscriptMock: vi.fn(),
  completeVoiceCallMock: vi.fn(),
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
  uploadVoiceRecordingMock: vi.fn(),
  webSocketInstances: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: Array<unknown>) => void;
    send: ReturnType<typeof vi.fn>;
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
    send = vi.fn();
    private handlers: Record<string, Array<(...args: Array<unknown>) => void>> = {};

    constructor() {
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
        callback(new MockWebSocket());
      },
    );
  }

  return { default: MockWebSocket, WebSocketServer: MockWebSocketServer };
});

vi.mock("../convex/runtimeClient", () => ({
  appendVoiceTranscript: appendVoiceTranscriptMock,
  completeVoiceCall: completeVoiceCallMock,
  fetchWebVoiceContext: fetchWebVoiceContextMock,
  recordVoiceAiCost: vi.fn(),
  RuntimeRequestError: runtimeRequestErrorClass,
  startWebVoiceCall: startWebVoiceCallMock,
  uploadVoiceRecording: uploadVoiceRecordingMock,
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

import { demoSnapshot } from "@lobbystack/shared";

import { createServer } from "../http/server";
import { createWebRealtimeTurnDetectionConfig } from "./routes";

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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    webSocketInstances.length = 0;
    delete process.env.OPENAI_API_KEY;
    delete process.env.WEB_CALL_ALLOWED_ORIGINS;
    delete process.env.WEB_CALL_MAX_DURATION_MS;
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

  it("rejects unknown public widget business slugs", async () => {
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
    expect(fetchWebVoiceContextMock).not.toHaveBeenCalled();
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
    expect(webSocketInstances[0]?.close).toHaveBeenCalledWith(1000, "web call ended");
  });

  it("uploads browser web call recordings for active sessions", async () => {
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
      durationMs: 1234,
      audio: Buffer.from("webm-recording"),
      contentType: "audio/webm",
    });
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
      Buffer.from(JSON.stringify({ type: "response.done", response: { id: "greeting" } })),
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
        durationMs: 1234,
      }),
    );
  });
});
