import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  endLiveCallSilently: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(function PostHog() {
    return {
      capture: mocks.capture,
      captureException: vi.fn(),
      shutdown: vi.fn(),
    };
  }),
}));

vi.mock("./transferCall", () => ({
  endLiveCallSilently: mocks.endLiveCallSilently,
  endLiveCallWithMessage: vi.fn(),
  transferLiveCall: vi.fn(),
}));

const ENV_KEYS = [
  "BACKEND_INTERNAL_URL",
  "DEPLOYMENT_MODE",
  "INTERNAL_SERVICE_TOKEN",
  "POSTHOG_HOST",
  "POSTHOG_KEY",
  "VOICE_GATEWAY_BASE_URL",
] as const;

describe("phone media stream telemetry", () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    mocks.capture.mockClear();
    mocks.endLiveCallSilently.mockReset();
    for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
    process.env.BACKEND_INTERNAL_URL = "https://admin.example.com";
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.INTERNAL_SERVICE_TOKEN = "test-service-token";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    process.env.POSTHOG_KEY = "phc_test";
    process.env.VOICE_GATEWAY_BASE_URL = "https://voice.example.com";
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
    vi.clearAllMocks();
  });

  async function loadMediaStream() {
    const posthog = await import("../observability/posthog");
    const mediaStream = await import("./mediaStream");
    posthog.setBusinessTelemetryConsent("business_123", true);
    const session = mediaStream.createActiveVoiceSession();
    session.businessId = "business_123";
    session.callId = "call_123";
    session.startedAtMs = Date.now() - 100;
    return { mediaStream, session };
  }

  function createRuntimeDoubles() {
    return {
      server: {
        log: {
          debug: vi.fn(),
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        },
      },
      openAiSocket: { readyState: 1, send: vi.fn(), close: vi.fn() },
      twilioSocket: { readyState: 1, send: vi.fn(), close: vi.fn() },
    };
  }

  it("emits ops.voice.playback_interrupted from caller speech handling", async () => {
    const { mediaStream, session } = await loadMediaStream();
    const { server, openAiSocket, twilioSocket } = createRuntimeDoubles();
    session.openingGreetingActive = false;
    session.streamSid = "stream_123";
    session.pendingOutboundAudio = ["dGVzdA=="];

    mediaStream.handleOpenAiMessage(
      server as never,
      openAiSocket as never,
      twilioSocket as never,
      session,
      Buffer.from(JSON.stringify({ type: "input_audio_buffer.speech_started" })),
    );

    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      event: "ops.voice.playback_interrupted",
      properties: expect.objectContaining({
        businessId: "business_123",
        callId: "call_123",
        channel: "phone",
        hadPendingPlayback: true,
      }),
    }));
  });

  it("emits ops.voice.transcription_failed from a provider failure message", async () => {
    const { mediaStream, session } = await loadMediaStream();
    const { server, openAiSocket, twilioSocket } = createRuntimeDoubles();

    mediaStream.handleOpenAiMessage(
      server as never,
      openAiSocket as never,
      twilioSocket as never,
      session,
      Buffer.from(JSON.stringify({
        type: "conversation.item.input_audio_transcription.failed",
        item_id: "caller-item-1",
      })),
    );

    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      event: "ops.voice.transcription_failed",
      properties: expect.objectContaining({
        businessId: "business_123",
        callId: "call_123",
        channel: "phone",
      }),
    }));
  });

  it("emits ops.voice.openai_realtime_state_conflict instead of paging on a lost response race", async () => {
    const { mediaStream, session } = await loadMediaStream();
    const { server, openAiSocket, twilioSocket } = createRuntimeDoubles();
    session.callSid = "CA123";
    session.streamSid = "stream_123";

    mediaStream.handleOpenAiMessage(
      server as never,
      openAiSocket as never,
      twilioSocket as never,
      session,
      Buffer.from(JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          code: "conversation_already_has_active_response",
        },
      })),
    );

    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      event: "ops.voice.openai_realtime_state_conflict",
      properties: expect.objectContaining({
        businessId: "business_123",
        callId: "call_123",
        "lobbystack.provider_error_code": "conversation_already_has_active_response",
      }),
    }));
    expect(mocks.capture).not.toHaveBeenCalledWith(expect.objectContaining({
      event: "ops.voice.openai_realtime_error",
    }));
    expect(mocks.capture).not.toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        $exception_type: "ProviderFailureError",
      }),
    }));
  });

  it("keeps the response gate closed when a create loses to an active response", async () => {
    const { mediaStream, session } = await loadMediaStream();
    const gate = await import("../realtime/responseGate");
    const { server, openAiSocket, twilioSocket } = createRuntimeDoubles();

    // A tool output is waiting on an answer, and our create for it was the one
    // the provider rejected.
    gate.markRealtimeConversationInput(session.responseGate);
    gate.requestRealtimeResponse(session.responseGate, undefined, "evt_create");
    gate.requestRealtimeResponse(session.responseGate, { instructions: "recover" });

    mediaStream.handleOpenAiMessage(
      server as never,
      openAiSocket as never,
      twilioSocket as never,
      session,
      Buffer.from(JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          code: "conversation_already_has_active_response",
          event_id: "evt_create",
        },
      })),
    );

    // A provider response really is active, so the next request must still be
    // held back, and the deferred one must survive to be answered.
    expect(session.responseGate.assistantResponseInFlight).toBe(true);
    expect(session.responseGate.deferredAssistantResponse).toEqual({
      request: { instructions: "recover" },
      forced: false,
    });

    // The active response finishing is what releases the gate and posts it.
    expect(
      gate.takeDeferredRealtimeResponse(session.responseGate, {
        responseId: "resp_provider",
      }),
    ).toMatchObject({ post: true, request: { instructions: "recover" } });
  });

  it("frees the response gate when a create is rejected outright", async () => {
    const { mediaStream, session } = await loadMediaStream();
    const gate = await import("../realtime/responseGate");
    const { server, openAiSocket, twilioSocket } = createRuntimeDoubles();

    gate.requestRealtimeResponse(session.responseGate, undefined, "evt_create");

    mediaStream.handleOpenAiMessage(
      server as never,
      openAiSocket as never,
      twilioSocket as never,
      session,
      Buffer.from(JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          code: "invalid_value",
          event_id: "evt_create",
        },
      })),
    );

    // Nothing will ever acknowledge that create, so holding the gate would
    // strand every later turn.
    expect(session.responseGate.assistantResponseInFlight).toBe(false);
  });

  it("still emits ops.voice.openai_realtime_error for a real provider failure", async () => {
    const { mediaStream, session } = await loadMediaStream();
    const { server, openAiSocket, twilioSocket } = createRuntimeDoubles();

    mediaStream.handleOpenAiMessage(
      server as never,
      openAiSocket as never,
      twilioSocket as never,
      session,
      Buffer.from(JSON.stringify({
        type: "error",
        error: { type: "server_error", code: "internal_error" },
      })),
    );

    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      event: "ops.voice.openai_realtime_error",
      properties: expect.objectContaining({
        businessId: "business_123",
        callId: "call_123",
      }),
    }));
  });

  it("emits ops.voice.hangup_retries_exhausted after the terminal retry budget", async () => {
    vi.useFakeTimers();
    mocks.endLiveCallSilently.mockRejectedValue(new Error("provider unavailable"));
    const { mediaStream, session } = await loadMediaStream();
    const { server, openAiSocket, twilioSocket } = createRuntimeDoubles();
    session.callSid = "CA123";
    const request = { reason: "caller_finished", message: "Goodbye." } as const;
    session.pendingImplicitEndCall = request;

    const completion = mediaStream.completeImplicitTerminalHangupWithRetry(
      server as never,
      openAiSocket as never,
      twilioSocket as never,
      session,
      request,
    );
    await vi.advanceTimersByTimeAsync(250 + 1_000 + 2_500);
    await completion;

    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      event: "ops.voice.hangup_retries_exhausted",
      properties: expect.objectContaining({
        businessId: "business_123",
        callId: "call_123",
        channel: "phone",
        reason: "caller_finished",
        attempts: 4,
      }),
    }));
    expect(twilioSocket.close).toHaveBeenCalledOnce();
  });
});
