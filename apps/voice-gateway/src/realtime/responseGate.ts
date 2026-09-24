// OpenAI Realtime allows one active response per conversation. When the model
// emits parallel function calls, each tool completion independently wants to
// post `response.create`, and every request after the first is rejected with
// `conversation_already_has_active_response`. This gate serializes those
// requests instead: the first one is posted, the rest coalesce into a single
// deferred request that is re-issued once the active response finishes.

export type RealtimeResponseRequest = Record<string, unknown> | undefined;

export type RealtimeResponseGate = {
  assistantResponseInFlight: boolean;
  activeAssistantResponseCreatedAtMs: number | null;
  lastConversationInputAtMs: number | null;
  deferredAssistantResponse: RealtimeResponseRequest | null;
};

export function createRealtimeResponseGate(): RealtimeResponseGate {
  return {
    assistantResponseInFlight: false,
    activeAssistantResponseCreatedAtMs: null,
    lastConversationInputAtMs: null,
    deferredAssistantResponse: null,
  };
}

// Records a conversation item the assistant still owes an answer for, such as a
// `function_call_output`. The timestamp is what later distinguishes input the
// active response could not have seen from input it already consumed.
export function markRealtimeConversationInput(
  gate: RealtimeResponseGate,
  nowMs: number,
): void {
  gate.lastConversationInputAtMs = nowMs;
}

// Returns true when the caller should post the request now. A false return
// means the request was deferred and will be reconsidered on `response.done`.
export function requestRealtimeResponse(
  gate: RealtimeResponseGate,
  request: RealtimeResponseRequest,
): boolean {
  if (gate.assistantResponseInFlight) {
    gate.deferredAssistantResponse = request ?? null;
    return false;
  }

  gate.assistantResponseInFlight = true;
  gate.deferredAssistantResponse = null;
  return true;
}

export function markRealtimeResponseCreated(
  gate: RealtimeResponseGate,
  nowMs: number,
): void {
  // The server can also create a response on its own, after a voice-activity
  // turn the gate never saw a request for.
  gate.assistantResponseInFlight = true;
  gate.activeAssistantResponseCreatedAtMs = nowMs;
}

// Clears the active response and returns the deferred request to post, if the
// finished response predates conversation input it could not have answered.
// Returning `{ post: false }` drops the deferred request as already covered.
export function takeDeferredRealtimeResponse(gate: RealtimeResponseGate): {
  post: boolean;
  request: RealtimeResponseRequest;
} {
  const deferred = gate.deferredAssistantResponse;
  const createdAtMs = gate.activeAssistantResponseCreatedAtMs;
  const inputAtMs = gate.lastConversationInputAtMs;

  gate.assistantResponseInFlight = false;
  gate.activeAssistantResponseCreatedAtMs = null;
  gate.deferredAssistantResponse = null;

  if (deferred === null) {
    return { post: false, request: undefined };
  }

  // Without a creation timestamp there is no evidence the active response saw
  // the newer input, so answering it is the safer side of the trade.
  const answeredNewerInput =
    createdAtMs !== null && inputAtMs !== null && inputAtMs <= createdAtMs;
  if (answeredNewerInput) {
    return { post: false, request: undefined };
  }

  gate.assistantResponseInFlight = true;
  return { post: true, request: deferred };
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
  if (gate.activeAssistantResponseCreatedAtMs !== null) {
    return false;
  }

  gate.assistantResponseInFlight = false;
  gate.deferredAssistantResponse = null;
  return true;
}

// A call that is ending or transferring must not start another turn.
export function resetRealtimeResponseGate(gate: RealtimeResponseGate): void {
  gate.assistantResponseInFlight = false;
  gate.activeAssistantResponseCreatedAtMs = null;
  gate.lastConversationInputAtMs = null;
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
