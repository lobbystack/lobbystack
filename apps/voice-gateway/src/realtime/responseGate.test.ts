import { describe, expect, it } from "vitest";

import {
  createRealtimeResponseGate,
  getRealtimeResponseGateStatus,
  isBenignRealtimeClientError,
  markRealtimeConversationInput,
  markRealtimeResponseCreated,
  releaseUnconfirmedRealtimeResponse,
  isRealtimeResponseInFlight,
  peekDeferredRealtimeResponse,
  requestRealtimeResponse,
  requeueRejectedRealtimeCreate,
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

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
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

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
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

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
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

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
      post: false,
      request: undefined,
    });
    expect(isRealtimeResponseInFlight(gate)).toBe(false);
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

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
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

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
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

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
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

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
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
    expect(isRealtimeResponseInFlight(gate)).toBe(true);
    expect(requestRealtimeResponse(gate, undefined)).toBe(false);
  });

  it("answers a deferred request when the response was never confirmed", () => {
    const gate = createRealtimeResponseGate();

    requestRealtimeResponse(gate, undefined);
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, { instructions: "recover" });

    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
      post: true,
      request: { instructions: "recover" },
    });
  });
});

describe("markRealtimeResponseCreated", () => {
  it("keeps the request's position when the gate asked for the response", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined);
    // Input lands after the create was sent but before it was acknowledged.
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined);
    markRealtimeResponseCreated(gate);

    // Ordering against the request rather than the acknowledgement is what
    // leaves this input still owed an answer.
    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({ post: true });
  });

  it("gives a server-started response its own place in the order", () => {
    const gate = createRealtimeResponseGate();
    markRealtimeConversationInput(gate);
    markRealtimeResponseCreated(gate);
    requestRealtimeResponse(gate, undefined);

    expect(isRealtimeResponseInFlight(gate)).toBe(true);
    // The response was created after that input, so it already saw it.
    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({ post: false });
  });
});

describe("releaseUnconfirmedRealtimeResponse", () => {
  it("frees the gate when the request it names was rejected before creation", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, { instructions: "bad" }, "evt_create");

    expect(releaseUnconfirmedRealtimeResponse(gate, "evt_create")).toMatchObject({
      released: true,
      post: false,
      request: undefined,
    });
    expect(requestRealtimeResponse(gate, undefined, "evt_next")).toBe(true);
  });

  it("hands back a request queued behind the rejected create", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_create");
    // A parallel tool completion queued up behind the create that failed. The
    // failed create emits no response.done, so nothing else would answer it.
    requestRealtimeResponse(gate, { instructions: "recover" });

    expect(releaseUnconfirmedRealtimeResponse(gate, "evt_create")).toMatchObject({
      released: true,
      post: true,
      request: { instructions: "recover" },
    });
    expect(isRealtimeResponseInFlight(gate)).toBe(false);
  });

  it("ignores an error about some earlier client event", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_create");

    // A late `response_cancel_not_active` for a `response.cancel` sent during
    // barge-in must not clear the create that is still waiting to be created.
    expect(releaseUnconfirmedRealtimeResponse(gate, "evt_cancel").released).toBe(
      false,
    );
    expect(isRealtimeResponseInFlight(gate)).toBe(true);
    expect(requestRealtimeResponse(gate, undefined, "evt_other")).toBe(false);
  });

  it("ignores an error that names no client event at all", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_create");

    expect(releaseUnconfirmedRealtimeResponse(gate, undefined).released).toBe(
      false,
    );
    expect(isRealtimeResponseInFlight(gate)).toBe(true);
  });

  it("keeps the gate closed while a confirmed response is still running", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_create");
    markRealtimeResponseCreated(gate);
    requestRealtimeResponse(gate, { instructions: "second" });

    expect(releaseUnconfirmedRealtimeResponse(gate, "evt_create").released).toBe(
      false,
    );
    expect(isRealtimeResponseInFlight(gate)).toBe(true);
    expect(peekDeferredRealtimeResponse(gate)).toEqual({
      request: { instructions: "second" },
      forced: false,
    });
  });

  it("does nothing when no response is in flight", () => {
    expect(
      releaseUnconfirmedRealtimeResponse(createRealtimeResponseGate(), "evt_x")
        .released,
    ).toBe(false);
  });
});

describe("requeueRejectedRealtimeCreate", () => {
  it("queues the rejected create so the active response answers it", () => {
    const gate = createRealtimeResponseGate();
    markRealtimeConversationInput(gate);
    requestRealtimeResponse(gate, undefined, "evt_create");

    expect(requeueRejectedRealtimeCreate(gate, "evt_create")).toBe(true);
    // The gate stays closed: a provider response really is running.
    expect(isRealtimeResponseInFlight(gate)).toBe(true);
    expect(takeDeferredRealtimeResponse(gate, { responseId: "resp_other" })).toMatchObject({
      post: true,
      request: undefined,
    });
  });

  it("keeps a forced terminal message when its create is rejected", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, { instructions: "goodbye" }, "evt_final");

    expect(requeueRejectedRealtimeCreate(gate, "evt_final")).toBe(true);
    expect(takeDeferredRealtimeResponse(gate, { responseId: "resp_other" })).toMatchObject({
      post: true,
      request: { instructions: "goodbye" },
    });
  });

  it("lets a newer queued request win over the rejected one", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_create");
    requestRealtimeResponse(gate, { instructions: "recover" });

    requeueRejectedRealtimeCreate(gate, "evt_create");

    expect(takeDeferredRealtimeResponse(gate, { responseId: "resp_other" })).toMatchObject({
      post: true,
      request: { instructions: "recover" },
    });
  });

  it("ignores an error that does not name the pending create", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, { instructions: "goodbye" }, "evt_final");

    expect(requeueRejectedRealtimeCreate(gate, "evt_cancel")).toBe(false);
    expect(peekDeferredRealtimeResponse(gate)).toBeNull();
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

    expect(isRealtimeResponseInFlight(gate)).toBe(false);
    expect(getRealtimeResponseGateStatus(gate)).toBe("idle");
    expect(peekDeferredRealtimeResponse(gate)).toBeNull();
    expect(takeDeferredRealtimeResponse(gate)).toMatchObject({
      post: false,
      request: undefined,
    });
  });
});

describe("takeDeferredRealtimeResponse response correlation", () => {
  it("ignores a response.done for a response the gate is not tracking", () => {
    const gate = createRealtimeResponseGate();

    // The response that produced the tool call is confirmed and still running.
    requestRealtimeResponse(gate, undefined, "evt_turn");
    markRealtimeResponseCreated(gate, "resp_turn");

    // A tool asked to end the call, so the terminal message takes over.
    resetRealtimeResponseGate(gate);
    requestRealtimeResponse(gate, { instructions: "goodbye" }, "evt_final");

    // The superseded response finishes afterwards. Releasing on it would free
    // the gate while the terminal message is still in flight.
    expect(
      takeDeferredRealtimeResponse(gate, { responseId: "resp_turn" }),
    ).toMatchObject({ post: false, request: undefined });
    expect(isRealtimeResponseInFlight(gate)).toBe(true);
    expect(requestRealtimeResponse(gate, undefined)).toBe(false);
  });

  it("releases on the response.done that matches the tracked response", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_turn");
    markRealtimeResponseCreated(gate, "resp_turn");

    expect(
      takeDeferredRealtimeResponse(gate, { responseId: "resp_turn" }),
    ).toMatchObject({ post: false, request: undefined });
    expect(isRealtimeResponseInFlight(gate)).toBe(false);
  });

  it("releases on the terminal message's own done after the superseded one", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_turn");
    markRealtimeResponseCreated(gate, "resp_turn");
    resetRealtimeResponseGate(gate);
    requestRealtimeResponse(gate, { instructions: "goodbye" }, "evt_final");
    markRealtimeResponseCreated(gate, "resp_final");

    // The superseded response finishes after the terminal one was created.
    expect(
      takeDeferredRealtimeResponse(gate, { responseId: "resp_turn" }),
    ).toMatchObject({ post: false, request: undefined });
    expect(isRealtimeResponseInFlight(gate)).toBe(true);

    // The terminal message's own done then releases the gate.
    expect(
      takeDeferredRealtimeResponse(gate, { responseId: "resp_final" }),
    ).toMatchObject({ post: false, request: undefined });
    expect(isRealtimeResponseInFlight(gate)).toBe(false);
  });

  it("releases on an unknown id when it is tracking no response", () => {
    const gate = createRealtimeResponseGate();
    // The greeting create was never acknowledged — a missed `response.created`
    // must not strand the gate when that response finishes.
    requestRealtimeResponse(gate, undefined, "evt_greeting");

    expect(
      takeDeferredRealtimeResponse(gate, { responseId: "resp_greeting" }),
    ).toMatchObject({ post: false, request: undefined });
    expect(isRealtimeResponseInFlight(gate)).toBe(false);
  });

  it("still releases when a response.done carries no id to correlate", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_turn");
    markRealtimeResponseCreated(gate, "resp_turn");

    expect(takeDeferredRealtimeResponse(gate, {})).toMatchObject({
      post: false,
      request: undefined,
    });
    expect(isRealtimeResponseInFlight(gate)).toBe(false);
  });
});

describe("forced terminal messages", () => {
  it("drains a rejected terminal create on the superseded response's done", () => {
    const gate = createRealtimeResponseGate();

    // The response that produced the endCall tool is running.
    requestRealtimeResponse(gate, undefined, "evt_turn");
    markRealtimeResponseCreated(gate, "resp_turn");

    // The terminal message takes over, but the provider rejects its create
    // because that response has not finished yet.
    resetRealtimeResponseGate(gate);
    requestRealtimeResponse(gate, { instructions: "goodbye" }, "evt_final", {
      forced: true,
    });
    expect(requeueRejectedRealtimeCreate(gate, "evt_final")).toBe(true);

    // That response finishing is now the only event that can post the goodbye.
    expect(
      takeDeferredRealtimeResponse(gate, { responseId: "resp_turn" }),
    ).toEqual({
      post: true,
      request: { instructions: "goodbye" },
      forced: true,
    });
  });

  it("still protects a live terminal response from the superseded done", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_turn");
    markRealtimeResponseCreated(gate, "resp_turn");
    resetRealtimeResponseGate(gate);
    requestRealtimeResponse(gate, { instructions: "goodbye" }, "evt_final", {
      forced: true,
    });

    // The terminal create was accepted this time, so the superseded response's
    // done must not free the gate underneath it.
    expect(
      takeDeferredRealtimeResponse(gate, { responseId: "resp_turn" }).post,
    ).toBe(false);
    expect(isRealtimeResponseInFlight(gate)).toBe(true);
  });

  it("keeps a queued terminal message ahead of ordinary requests", () => {
    const gate = createRealtimeResponseGate();
    requestRealtimeResponse(gate, undefined, "evt_turn");
    markRealtimeResponseCreated(gate, "resp_turn");
    resetRealtimeResponseGate(gate);
    requestRealtimeResponse(gate, { instructions: "goodbye" }, "evt_final", {
      forced: true,
    });
    requeueRejectedRealtimeCreate(gate, "evt_final");

    // A parallel tool completion must not displace the goodbye.
    requestRealtimeResponse(gate, undefined);
    requestRealtimeResponse(gate, { instructions: "recover" });

    expect(
      takeDeferredRealtimeResponse(gate, { responseId: "resp_turn" }),
    ).toMatchObject({ request: { instructions: "goodbye" }, forced: true });
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
