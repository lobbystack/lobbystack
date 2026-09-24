import { describe, expect, it } from "vitest";

import {
  createRealtimeResponseGate,
  isBenignRealtimeClientError,
  markRealtimeConversationInput,
  markRealtimeResponseCreated,
  releaseUnconfirmedRealtimeResponse,
  requestRealtimeResponse,
  resetRealtimeResponseGate,
  takeDeferredRealtimeResponse,
} from "./responseGate";

describe("requestRealtimeResponse", () => {
  it("posts the first request and defers the ones racing behind it", () => {
    const gate = createRealtimeResponseGate();

    expect(requestRealtimeResponse(gate, undefined)).toBe(true);
    expect(requestRealtimeResponse(gate, { instructions: "second" })).toBe(false);
    expect(requestRealtimeResponse(gate, { instructions: "third" })).toBe(false);
  });

  it("coalesces every deferred request into the most recent one", () => {
    const gate = createRealtimeResponseGate();

    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate, 1_000);
    requestRealtimeResponse(gate, { instructions: "second" });
    requestRealtimeResponse(gate, { instructions: "third" });
    markRealtimeConversationInput(gate, 2_000);

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: true,
      request: { instructions: "third" },
    });
  });
});

describe("takeDeferredRealtimeResponse", () => {
  it("releases the gate for the next turn when nothing was deferred", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate, 1_000);

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: false,
      request: undefined,
    });
    expect(gate.assistantResponseInFlight).toBe(false);
    expect(requestRealtimeResponse(gate, undefined)).toBe(true);
  });

  it("drops a deferred request the finished response already answered", () => {
    const gate = createRealtimeResponseGate();

    // Both tool outputs land before the response is created, so the model saw
    // them and the second request has nothing left to answer.
    markRealtimeConversationInput(gate, 1_000);
    requestRealtimeResponse(gate, undefined);
    markRealtimeConversationInput(gate, 1_050);
    requestRealtimeResponse(gate, { instructions: "recover" });
    markRealtimeResponseCreated(gate, 2_000);

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: false,
      request: undefined,
    });
  });

  it("answers input that landed after the finished response was created", () => {
    const gate = createRealtimeResponseGate();

    markRealtimeConversationInput(gate, 1_000);
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate, 1_500);
    // The slower tool finished after the response was already under way.
    markRealtimeConversationInput(gate, 2_000);
    requestRealtimeResponse(gate, { instructions: "recover" });

    const deferred = takeDeferredRealtimeResponse(gate);
    expect(deferred).toEqual({ post: true, request: { instructions: "recover" } });
    // The follow-up is itself an active response until it completes.
    expect(gate.assistantResponseInFlight).toBe(true);
    expect(requestRealtimeResponse(gate, undefined)).toBe(false);
  });

  it("answers a deferred request when the response was never confirmed", () => {
    const gate = createRealtimeResponseGate();

    requestRealtimeResponse(gate, undefined);
    markRealtimeConversationInput(gate, 1_000);
    requestRealtimeResponse(gate, { instructions: "recover" });

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: true,
      request: { instructions: "recover" },
    });
  });
});

describe("releaseUnconfirmedRealtimeResponse", () => {
  it("frees the gate when the request was rejected before it was created", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, { instructions: "bad" });

    expect(releaseUnconfirmedRealtimeResponse(gate)).toBe(true);
    expect(requestRealtimeResponse(gate, undefined)).toBe(true);
  });

  it("keeps the gate closed while a confirmed response is still running", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate, 1_000);
    requestRealtimeResponse(gate, { instructions: "second" });

    expect(releaseUnconfirmedRealtimeResponse(gate)).toBe(false);
    expect(gate.assistantResponseInFlight).toBe(true);
    expect(gate.deferredAssistantResponse).toEqual({ instructions: "second" });
  });

  it("does nothing when no response is in flight", () => {
    expect(releaseUnconfirmedRealtimeResponse(createRealtimeResponseGate())).toBe(
      false,
    );
  });
});

describe("resetRealtimeResponseGate", () => {
  it("discards a deferred follow-up so it cannot outlive the call", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate, 1_000);
    markRealtimeConversationInput(gate, 2_000);
    requestRealtimeResponse(gate, { instructions: "recover" });

    resetRealtimeResponseGate(gate);

    expect(gate).toEqual(createRealtimeResponseGate());
    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: false,
      request: undefined,
    });
  });
});

describe("isBenignRealtimeClientError", () => {
  it("recognizes conversation state conflicts the call recovers from", () => {
    expect(
      isBenignRealtimeClientError({
        type: "invalid_request_error",
        code: "conversation_already_has_active_response",
      }),
    ).toBe(true);
    expect(
      isBenignRealtimeClientError({ code: "RESPONSE_CANCEL_NOT_ACTIVE" }),
    ).toBe(true);
  });

  it("leaves real provider failures alertable", () => {
    expect(isBenignRealtimeClientError({ type: "server_error" })).toBe(false);
    expect(isBenignRealtimeClientError({ code: "insufficient_quota" })).toBe(false);
    expect(isBenignRealtimeClientError(undefined)).toBe(false);
  });
});
