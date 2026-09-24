// OpenAI Realtime allows one active response per conversation. When the model
// emits parallel function calls, each tool completion independently wants to
// post `response.create`, and every request after the first is rejected with
// `conversation_already_has_active_response`. This gate serializes those
// requests instead: the first one is posted, the rest coalesce into a single
// deferred request that is re-issued once the active response finishes.

export type RealtimeResponseRequest = Record<string, unknown> | undefined;

// Wrapping the request keeps "nothing deferred" (null) distinct from "a
// deferred request that carries no options", which is what an ordinary tool
// completion asks for.
type DeferredRealtimeResponse = { request: RealtimeResponseRequest };

export type RealtimeResponseGate = {
  assistantResponseInFlight: boolean;
  // Ordering runs on a counter, not a clock. Adjacent promise continuations
  // land in the same millisecond, and `Date.now()` cannot then tell a tool
  // output sent after a `response.create` from one sent before it.
  sequence: number;
  // Where the active response was asked for in that order, not where the
  // provider acknowledged it. The provider orders the conversation by what it
  // received, so the request is what conversation input is compared against.
  activeAssistantResponseStartedSeq: number | null;
  activeAssistantResponseConfirmed: boolean;
  lastConversationInputSeq: number | null;
  deferredAssistantResponse: DeferredRealtimeResponse | null;
};

export function createRealtimeResponseGate(): RealtimeResponseGate {
  return {
    assistantResponseInFlight: false,
    sequence: 0,
    activeAssistantResponseStartedSeq: null,
    activeAssistantResponseConfirmed: false,
    lastConversationInputSeq: null,
    deferredAssistantResponse: null,
  };
}

// Records a conversation item the assistant still owes an answer for, such as a
// `function_call_output`. Its place in the order is what later distinguishes
// input the active response could not have seen from input it already saw.
export function markRealtimeConversationInput(
  gate: RealtimeResponseGate,
): void {
  gate.sequence += 1;
  gate.lastConversationInputSeq = gate.sequence;
}

// Returns true when the caller should post the request now. A false return
// means the request was deferred and will be reconsidered on `response.done`.
export function requestRealtimeResponse(
  gate: RealtimeResponseGate,
  request: RealtimeResponseRequest,
): boolean {
  if (gate.assistantResponseInFlight) {
    gate.deferredAssistantResponse = { request };
    return false;
  }

  gate.assistantResponseInFlight = true;
  gate.sequence += 1;
  gate.activeAssistantResponseStartedSeq = gate.sequence;
  gate.activeAssistantResponseConfirmed = false;
  gate.deferredAssistantResponse = null;
  return true;
}

export function markRealtimeResponseCreated(gate: RealtimeResponseGate): void {
  // The server can also create a response on its own, after a voice-activity
  // turn the gate never saw a request for. One of those takes its place in the
  // order here, which is the earliest point the gate learns of it.
  gate.assistantResponseInFlight = true;
  gate.activeAssistantResponseConfirmed = true;
  if (gate.activeAssistantResponseStartedSeq === null) {
    gate.sequence += 1;
    gate.activeAssistantResponseStartedSeq = gate.sequence;
  }
}

// Clears the active response and returns the deferred request to post. A
// request whose only job was to answer conversation input is dropped when the
// finished response already covered that input; anything carrying its own
// instructions always posts.
export function takeDeferredRealtimeResponse(gate: RealtimeResponseGate): {
  post: boolean;
  request: RealtimeResponseRequest;
} {
  const deferred = gate.deferredAssistantResponse;
  const startedSeq = gate.activeAssistantResponseStartedSeq;
  const inputSeq = gate.lastConversationInputSeq;

  gate.assistantResponseInFlight = false;
  gate.activeAssistantResponseStartedSeq = null;
  gate.activeAssistantResponseConfirmed = false;
  gate.deferredAssistantResponse = null;

  if (deferred === null) {
    return { post: false, request: undefined };
  }

  // A request that carries instructions of its own — a hold check-in, a tool
  // failure recovery — is not answering conversation input, so no ordering of
  // that input can show it was covered.
  if (deferred.request === undefined) {
    // Without a recorded position there is no evidence the active response saw
    // the newer input, so answering it is the safer side of the trade.
    const answeredInput =
      startedSeq !== null && inputSeq !== null && inputSeq <= startedSeq;
    if (answeredInput) {
      return { post: false, request: undefined };
    }
  }

  gate.assistantResponseInFlight = true;
  gate.sequence += 1;
  gate.activeAssistantResponseStartedSeq = gate.sequence;
  return { post: true, request: deferred.request };
}

// The gate marks a response in flight the moment it is requested, before the
// server confirms it. If that request is rejected outright there will be no
// `response.done` to release the gate, which would strand every later turn.
// A rejection while a confirmed response is active is the ordinary
// `conversation_already_has_active_response` case and must not release it.
export function releaseUnconfirmedRealtimeResponse(
  gate: RealtimeResponseGate,
): boolean {
  if (!gate.assistantResponseInFlight) {
    return false;
  }
  if (gate.activeAssistantResponseConfirmed) {
    return false;
  }

  gate.assistantResponseInFlight = false;
  gate.activeAssistantResponseStartedSeq = null;
  gate.deferredAssistantResponse = null;
  return true;
}

// A call that is ending or transferring must not start another turn.
export function resetRealtimeResponseGate(gate: RealtimeResponseGate): void {
  gate.assistantResponseInFlight = false;
  gate.activeAssistantResponseStartedSeq = null;
  gate.activeAssistantResponseConfirmed = false;
  gate.lastConversationInputSeq = null;
  gate.deferredAssistantResponse = null;
}

const BENIGN_REALTIME_CLIENT_ERROR_CODES = new Set([
  "conversation_already_has_active_response",
  "response_cancel_not_active",
]);

// These codes report a client/server race over conversation state, not a
// provider failure: the call is unaffected and the turn still completes. They
// are worth a log line and a metric, never an alertable exception.
export function isBenignRealtimeClientError(error?: {
  type?: string;
  code?: string;
}): boolean {
  const code = error?.code?.trim().toLowerCase() ?? "";
  return BENIGN_REALTIME_CLIENT_ERROR_CODES.has(code);
}
