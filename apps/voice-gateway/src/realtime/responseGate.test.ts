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

  it("keeps deferred instructions when a bare request coalesces behind them", () => {
    const gate = createRealtimeResponseGate();

    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);
    // A tool failure recovery is deferred, then a successful parallel tool
    // completion asks for a plain answer. Dropping the instructions here would
    // leave the recovery turn without them.
    requestRealtimeResponse(gate, { instructions: "recover" });
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: true,
      request: { instructions: "recover" },
    });
  });

  it("lets a newer instructed request replace a deferred one", () => {
    const gate = createRealtimeResponseGate();

    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);
    requestRealtimeResponse(gate, { instructions: "first" });
    requestRealtimeResponse(gate, { instructions: "second" });

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: true,
      request: { instructions: "second" },
    });
  });

  it("coalesces every deferred request into the most recent one", () => {
    const gate = createRealtimeResponseGate();

    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);
    requestRealtimeResponse(gate, { instructions: "second" });
    requestRealtimeResponse(gate, { instructions: "third" });
    markRealtimeConversationInput(gate);

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
    markRealtimeResponseCreated(gate);

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: false,
      request: undefined,
    });
    expect(gate.assistantResponseInFlight).toBe(false);
    expect(requestRealtimeResponse(gate, undefined)).toBe(true);
  });

  it("answers a deferred request that carries no options of its own", () => {
    const gate = createRealtimeResponseGate();

    // Two successful tool calls in one turn: neither asks for instructions, so
    // a deferred parameterless request must stay distinguishable from none.
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: true,
      request: undefined,
    });
  });

  it("drops a deferred request the finished response already answered", () => {
    const gate = createRealtimeResponseGate();

    // Both tool outputs land before the response is requested, so the model saw
    // them and the second request has nothing left to answer.
    markRealtimeConversationInput(gate);
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: false,
      request: undefined,
    });
  });

  it("answers input recorded after the request within the same millisecond", () => {
    const gate = createRealtimeResponseGate();

    // Adjacent promise continuations share a clock reading, so ordering has to
    // come from the sequence rather than from a timestamp comparison.
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: true,
      request: undefined,
    });
  });

  it("keeps a deferred request that carries its own instructions", () => {
    const gate = createRealtimeResponseGate();

    // A hold-expiry check-in is not answering conversation input, so input
    // ordering cannot show the finished response covered it.
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);
    requestRealtimeResponse(gate, { instructions: "still there?" });

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: true,
      request: { instructions: "still there?" },
    });
  });

  it("marks the posted follow-up as the new active response", () => {
    const gate = createRealtimeResponseGate();

    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);

    expect(takeDeferredRealtimeResponse(gate).post).toBe(true);
    expect(gate.assistantResponseInFlight).toBe(true);
    expect(requestRealtimeResponse(gate, undefined)).toBe(false);
  });

  it("answers a deferred request when the response was never confirmed", () => {
    const gate = createRealtimeResponseGate();

    requestRealtimeResponse(gate, undefined);
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, { instructions: "recover" });

    expect(takeDeferredRealtimeResponse(gate)).toEqual({
      post: true,
      request: { instructions: "recover" },
    });
  });
});

describe("markRealtimeResponseCreated", () => {
  it("keeps the request's position when the gate asked for the response", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined);
    const requestedSeq = gate.activeAssistantResponseStartedSeq;
    markRealtimeConversationInput(gate);
    markRealtimeResponseCreated(gate);

    expect(gate.activeAssistantResponseStartedSeq).toBe(requestedSeq);
  });

  it("gives a server-started response its own place in the order", () => {
    const gate = createRealtimeResponseGate();
    markRealtimeConversationInput(gate);
    markRealtimeResponseCreated(gate);

    expect(gate.assistantResponseInFlight).toBe(true);
    expect(gate.activeAssistantResponseStartedSeq).toBe(gate.sequence);
  });
});

describe("releaseUnconfirmedRealtimeResponse", () => {
  it("frees the gate when the request it names was rejected before creation", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, { instructions: "bad" }, "evt_create");

    expect(releaseUnconfirmedRealtimeResponse(gate, "evt_create")).toBe(true);
    expect(requestRealtimeResponse(gate, undefined, "evt_next")).toBe(true);
  });

  it("ignores an error about some earlier client event", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_create");

    // A late `response_cancel_not_active` for a `response.cancel` sent during
    // barge-in must not clear the create that is still waiting to be created.
    expect(releaseUnconfirmedRealtimeResponse(gate, "evt_cancel")).toBe(false);
    expect(gate.assistantResponseInFlight).toBe(true);
    expect(requestRealtimeResponse(gate, undefined, "evt_other")).toBe(false);
  });

  it("ignores an error that names no client event at all", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_create");

    expect(releaseUnconfirmedRealtimeResponse(gate, undefined)).toBe(false);
    expect(gate.assistantResponseInFlight).toBe(true);
  });

  it("keeps the gate closed while a confirmed response is still running", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_create");
    markRealtimeResponseCreated(gate);
    requestRealtimeResponse(gate, { instructions: "second" });

    expect(releaseUnconfirmedRealtimeResponse(gate, "evt_create")).toBe(false);
    expect(gate.assistantResponseInFlight).toBe(true);
    expect(gate.deferredAssistantResponse).toEqual({
      request: { instructions: "second" },
    });
  });

  it("does nothing when no response is in flight", () => {
    expect(
      releaseUnconfirmedRealtimeResponse(createRealtimeResponseGate(), "evt_x"),
    ).toBe(false);
  });
});

describe("resetRealtimeResponseGate", () => {
  it("discards a deferred follow-up so it cannot outlive the call", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, { instructions: "recover" });

    resetRealtimeResponseGate(gate);

    expect(gate.assistantResponseInFlight).toBe(false);
    expect(gate.activeAssistantResponseStartedSeq).toBeNull();
    expect(gate.lastConversationInputSeq).toBeNull();
    expect(gate.deferredAssistantResponse).toBeNull();
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
