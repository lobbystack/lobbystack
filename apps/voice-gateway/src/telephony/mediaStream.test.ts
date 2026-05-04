import { describe, expect, it } from "vitest";

import {
  createCallInactivityState,
  getCallInactivityAction,
  getDispositionForEndCall,
  grantCallHold,
  markAssistantResponseDone,
  markCallerActivity,
  markHoldExpiryCheckInSent,
  markRealtimeIdleTimeout,
  shouldSystemBlockForEndCall,
} from "../realtime/callControl";
import {
  estimateRealtimeTotalCostUsd,
  getImplicitEndCallForAssistantTranscript,
  getRealtimeGenerationOutcome,
  markRealtimeToolCallHandled,
  shouldRecoverFromOpenAiRealtimeServerError,
  shouldSkipImplicitEndCallAudioDone,
  shouldSkipImplicitEndCallResponseDone,
  shouldUseAssistantFinalMessageForToolEndCall,
} from "./mediaStream";

describe("estimateRealtimeTotalCostUsd", () => {
  it("prefers provider-reported total cost when available", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 20,
        totalCostUsd: 0.42,
      },
      {
        inputTokenPriceUsd: 0.001,
        outputTokenPriceUsd: 0.002,
        cachedInputTokenPriceUsd: 0.0005,
      },
    );

    expect(totalCostUsd).toBe(0.42);
  });

  it("computes total cost from configured realtime token pricing", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 20,
      },
      {
        inputTokenPriceUsd: 0.001,
        outputTokenPriceUsd: 0.002,
        cachedInputTokenPriceUsd: 0.0005,
      },
    );

    expect(totalCostUsd).toBeCloseTo(0.19);
  });

  it("computes realtime voice cost from text, audio, and cached token buckets", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 132,
        outputTokens: 121,
        textInputTokens: 119,
        audioInputTokens: 13,
        cachedInputTokens: 64,
        cachedTextInputTokens: 64,
        cachedAudioInputTokens: 0,
        textOutputTokens: 30,
        audioOutputTokens: 91,
      },
      {
        textInputTokenPriceUsd: 0.000005,
        audioInputTokenPriceUsd: 0.000032,
        textOutputTokenPriceUsd: 0.00002,
        audioOutputTokenPriceUsd: 0.000064,
        cachedInputTokenPriceUsd: 0.0000025,
      },
    );

    expect(totalCostUsd).toBeCloseTo(0.007967);
  });

  it("returns undefined when detailed audio pricing is missing", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        textInputTokens: 119,
        audioInputTokens: 13,
        cachedInputTokens: 64,
        cachedTextInputTokens: 64,
        textOutputTokens: 30,
        audioOutputTokens: 91,
      },
      {
        textInputTokenPriceUsd: 0.000005,
        textOutputTokenPriceUsd: 0.00002,
        cachedInputTokenPriceUsd: 0.0000025,
      },
    );

    expect(totalCostUsd).toBeUndefined();
  });

  it("returns undefined when cached tokens are not broken down by modality", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        textInputTokens: 119,
        audioInputTokens: 13,
        cachedInputTokens: 64,
        textOutputTokens: 30,
        audioOutputTokens: 91,
      },
      {
        textInputTokenPriceUsd: 0.000005,
        audioInputTokenPriceUsd: 0.000032,
        textOutputTokenPriceUsd: 0.00002,
        audioOutputTokenPriceUsd: 0.000064,
        cachedInputTokenPriceUsd: 0.0000025,
      },
    );

    expect(totalCostUsd).toBeUndefined();
  });

  it("returns undefined when no provider cost or pricing config is available", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 100,
        outputTokens: 50,
      },
      {},
    );

    expect(totalCostUsd).toBeUndefined();
  });

  it("computes transcription cost from generic input and output pricing", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 2400,
        outputTokens: 320,
        totalTokens: 2720,
      },
      {
        inputTokenPriceUsd: 0.00000125,
        outputTokenPriceUsd: 0.000005,
      },
    );

    expect(totalCostUsd).toBeCloseTo(0.0046);
  });

  it("computes transcription cost when usage includes audio input and text output buckets", () => {
    const totalCostUsd = estimateRealtimeTotalCostUsd(
      {
        inputTokens: 2400,
        outputTokens: 320,
        totalTokens: 2720,
        audioInputTokens: 2400,
        textOutputTokens: 320,
      },
      {
        inputTokenPriceUsd: 0.00000125,
        outputTokenPriceUsd: 0.000005,
        textInputTokenPriceUsd: 0.00000125,
        audioInputTokenPriceUsd: 0.00000125,
        textOutputTokenPriceUsd: 0.000005,
        audioOutputTokenPriceUsd: 0.000005,
      },
    );

    expect(totalCostUsd).toBeCloseTo(0.0046);
  });
});

describe("getRealtimeGenerationOutcome", () => {
  it("does not mark completed generations as errors", () => {
    expect(getRealtimeGenerationOutcome("completed")).toEqual({
      isError: false,
    });
  });

  it("treats cancelled generations as interruptions instead of errors", () => {
    expect(getRealtimeGenerationOutcome("cancelled")).toEqual({
      isError: false,
      error: "cancelled",
    });
  });

  it("still marks other terminal statuses as errors", () => {
    expect(getRealtimeGenerationOutcome("failed")).toEqual({
      isError: true,
      error: "failed",
    });
  });
});

describe("shouldRecoverFromOpenAiRealtimeServerError", () => {
  it("keeps recoverable invalid request errors on the active session", () => {
    expect(
      shouldRecoverFromOpenAiRealtimeServerError({
        classification: {
          provider: "openai",
          kind: "invalid_request",
          providerErrorCode: "invalid_event",
        },
        error: {
          type: "invalid_request_error",
          code: "invalid_event",
        },
      }),
    ).toBe(false);
  });

  it("recovers terminal provider capacity and server errors", () => {
    expect(
      shouldRecoverFromOpenAiRealtimeServerError({
        classification: {
          provider: "openai",
          kind: "rate_limited",
        },
      }),
    ).toBe(true);
    expect(
      shouldRecoverFromOpenAiRealtimeServerError({
        classification: {
          provider: "openai",
          kind: "unknown",
        },
        error: {
          type: "server_error",
        },
      }),
    ).toBe(true);
  });
});

describe("markRealtimeToolCallHandled", () => {
  it("allows the first realtime tool event and suppresses duplicate call IDs", () => {
    const session = {
      handledToolCallIds: new Set<string>(),
    };

    expect(markRealtimeToolCallHandled(session, "call_123")).toBe(true);
    expect(markRealtimeToolCallHandled(session, "call_123")).toBe(false);
    expect(markRealtimeToolCallHandled(session, "call_456")).toBe(true);
  });
});

describe("call inactivity control", () => {
  it("times out silent calls 75 seconds after assistant playback", () => {
    let state = createCallInactivityState();
    state = markAssistantResponseDone(state, 1_000);
    state = markRealtimeIdleTimeout(state, 31_000);

    expect(getCallInactivityAction(state, 31_000)).toEqual({
      kind: "none",
      nextCheckInMs: 45_000,
    });
    expect(getCallInactivityAction(state, 76_000)).toEqual({
      kind: "silence_timeout",
    });
  });

  it("suppresses the normal silence timeout during an active hold", () => {
    let state = createCallInactivityState();
    state = markAssistantResponseDone(state, 1_000);
    const grant = grantCallHold(state, {
      requestedDurationSeconds: 120,
      reason: "Caller asked to check something.",
      nowMs: 10_000,
    });
    state = grant.state;

    expect(grant.result).toMatchObject({
      ok: true,
      grantedDurationSeconds: 120,
    });
    expect(getCallInactivityAction(state, 76_000)).toEqual({
      kind: "none",
      nextCheckInMs: 54_000,
    });
  });

  it("checks in when a hold expires, then times out after the grace window", () => {
    let state = createCallInactivityState();
    state = grantCallHold(state, {
      requestedDurationSeconds: 30,
      reason: "Caller asked for a moment.",
      nowMs: 1_000,
    }).state;

    expect(getCallInactivityAction(state, 31_000)).toEqual({
      kind: "hold_expired_check_in",
    });

    state = markHoldExpiryCheckInSent(state, 31_000);
    expect(getCallInactivityAction(state, 60_000)).toEqual({
      kind: "none",
      nextCheckInMs: 1_000,
    });
    expect(getCallInactivityAction(state, 61_000)).toEqual({
      kind: "silence_timeout",
    });
  });

  it("caller activity resets hold and silence state but preserves used hold budget", () => {
    let state = createCallInactivityState();
    state = grantCallHold(state, {
      requestedDurationSeconds: 60,
      reason: "Caller asked to look something up.",
      nowMs: 1_000,
    }).state;
    state = markHoldExpiryCheckInSent(state, 61_000);
    state = markCallerActivity(state);

    expect(state).toMatchObject({
      silenceWindowStartedAtMs: null,
      silenceCheckInSent: false,
      activeHoldExpiresAtMs: null,
      holdExpiryCheckInSentAtMs: null,
      holdSecondsUsed: 60,
    });
  });
});

describe("AI-directed call endings", () => {
  it("uses assistant final messages for every direct endCall tool result", () => {
    expect(shouldUseAssistantFinalMessageForToolEndCall({ reason: "caller_finished" })).toBe(
      true,
    );
    expect(shouldUseAssistantFinalMessageForToolEndCall({ reason: "silence_timeout" })).toBe(
      true,
    );
    expect(shouldUseAssistantFinalMessageForToolEndCall({ reason: "spam" })).toBe(
      true,
    );
    expect(shouldUseAssistantFinalMessageForToolEndCall({ reason: "abuse" })).toBe(
      true,
    );
  });

  it("maps spam endings to a durable spam disposition without auto-blocking", () => {
    expect(getDispositionForEndCall("spam")).toBe("spam_ended");
    expect(shouldSystemBlockForEndCall("spam")).toBe(false);
  });

  it("keeps abuse as the only AI-directed auto-blocking reason", () => {
    expect(getDispositionForEndCall("abuse")).toBe("abuse_ended");
    expect(shouldSystemBlockForEndCall("abuse")).toBe(true);
    expect(shouldSystemBlockForEndCall("caller_finished")).toBe(false);
    expect(shouldSystemBlockForEndCall("silence_timeout")).toBe(false);
  });

  it("recovers an omitted endCall tool when the assistant clearly ends an abusive call", () => {
    expect(
      getImplicitEndCallForAssistantTranscript({
        assistantText: "Je mets fin à cet appel. Au revoir.",
        recentCallerTexts: [
          "Vous êtes une bande de gros caves.",
          "Va donc chier, petit attardé.",
        ],
      }),
    ).toEqual({
      reason: "abuse",
      severity: "severe",
      message: "Je mets fin à cet appel. Au revoir.",
    });
  });

  it("recovers an omitted endCall tool as spam when the prior caller turns are solicitation", () => {
    expect(
      getImplicitEndCallForAssistantTranscript({
        assistantText: "I'll be ending the call now. Goodbye.",
        recentCallerTexts: [
          "I'm calling with a special offer for your business.",
          "Let me continue my sales pitch.",
        ],
      }),
    ).toMatchObject({
      reason: "spam",
      message: "I'll be ending the call now. Goodbye.",
    });
  });

  it("does not recover ordinary business buying questions as spam", () => {
    expect(
      getImplicitEndCallForAssistantTranscript({
        assistantText: "I'll be ending the call now. Goodbye.",
        recentCallerTexts: [
          "Do you sell gift cards?",
          "I'd like to buy one for my sister if you offer them.",
        ],
      }),
    ).toMatchObject({
      reason: "caller_finished",
      message: "I'll be ending the call now. Goodbye.",
    });
  });

  it("does not treat normal goodbyes or boundary warnings as implicit hangups", () => {
    expect(
      getImplicitEndCallForAssistantTranscript({
        assistantText: "Take care, and thanks for calling.",
        recentCallerTexts: ["Thanks, that's all."],
      }),
    ).toBeNull();
    expect(
      getImplicitEndCallForAssistantTranscript({
        assistantText:
          "Please keep the call respectful. If this continues, I will have to end the call.",
        recentCallerTexts: ["You are not helpful."],
      }),
    ).toBeNull();
  });

  it("skips the stale tool response completion while waiting for final-message audio", () => {
    const pendingImplicitEndCall = {
      reason: "spam",
      message: "We'll end the call here. Goodbye.",
    } as const;

    expect(
      shouldSkipImplicitEndCallResponseDone({
        pendingImplicitEndCall,
        skipNextResponseDone: true,
        staleResponseId: null,
        responseId: null,
      }),
    ).toBe(true);
    expect(
      shouldSkipImplicitEndCallResponseDone({
        pendingImplicitEndCall,
        skipNextResponseDone: true,
        staleResponseId: "response-stale",
        responseId: "response-stale",
      }),
    ).toBe(true);
    expect(
      shouldSkipImplicitEndCallResponseDone({
        pendingImplicitEndCall,
        skipNextResponseDone: true,
        staleResponseId: "response-stale",
        responseId: "response-final",
      }),
    ).toBe(false);
    expect(
      shouldSkipImplicitEndCallResponseDone({
        pendingImplicitEndCall,
        skipNextResponseDone: false,
        staleResponseId: null,
        responseId: null,
      }),
    ).toBe(false);
  });

  it("skips stale audio completion marks without skipping the final-message response", () => {
    const pendingImplicitEndCall = {
      reason: "spam",
      message: "We'll end the call here. Goodbye.",
    } as const;

    expect(
      shouldSkipImplicitEndCallAudioDone({
        pendingImplicitEndCall,
        staleResponseId: "response-stale",
        responseId: "response-stale",
      }),
    ).toBe(true);
    expect(
      shouldSkipImplicitEndCallAudioDone({
        pendingImplicitEndCall,
        staleResponseId: "response-stale",
        responseId: "response-final",
      }),
    ).toBe(false);
    expect(
      shouldSkipImplicitEndCallAudioDone({
        pendingImplicitEndCall,
        staleResponseId: null,
        responseId: "response-final",
      }),
    ).toBe(false);
  });
});
