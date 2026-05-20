import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const { fetchWebVoiceContextMock, runtimeRequestErrorClass, startWebVoiceCallMock } = vi.hoisted(
  () => ({
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
  }),
);

vi.mock("../convex/runtimeClient", () => ({
  completeVoiceCall: vi.fn(),
  fetchWebVoiceContext: fetchWebVoiceContextMock,
  recordVoiceAiCost: vi.fn(),
  RuntimeRequestError: runtimeRequestErrorClass,
  startWebVoiceCall: startWebVoiceCallMock,
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
      create_response: false,
      interrupt_response: false,
    });
  });

  it("defaults to normal web caller turn handling after the greeting", () => {
    expect(createWebRealtimeTurnDetectionConfig()).toEqual({
      type: "server_vad",
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
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.WEB_CALL_ALLOWED_ORIGINS;
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
});
