// OpenAI Realtime allows one active response per conversation. When the model
// emits parallel function calls, each tool completion independently wants to
// post `response.create`, and every request after the first is rejected with
// `conversation_already_has_active_response`. This gate serializes those
// requests instead: the first one is posted, the rest coalesce into a single
// deferred request that is re-issued once the active response finishes.

export type RealtimeResponseRequest = Record<string, unknown> | undefined;

// Wrapping the request keeps "nothing deferred" (null) distinct from "a
// deferred request that carries no options", which is what an ordinary tool
// completion asks for. `forced` marks a terminal message, which outranks every
// ordinary request and survives the checks that stop a call starting new turns.
type DeferredRealtimeResponse = {
  request: RealtimeResponseRequest;
  forced: boolean;
};

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
  // The `event_id` of the create we posted and are still waiting on, so a
  // provider error can be matched to it rather than assumed to be about it.
  pendingCreateEventId: string | null;
  // What that create asked for, kept so a rejected create can be queued again
  // rather than lost.
  pendingCreateRequest: DeferredRealtimeResponse | null;
  // The id of the response the gate is tracking, so a `response.done` for some
  // older response cannot release it.
  activeResponseId: string | null;
  // The response a forced terminal message replaced. Its `response.done` still
  // arrives afterwards and must not release the message that replaced it.
  supersededResponseId: string | null;
  lastConversationInputSeq: number | null;
  deferredAssistantResponse: DeferredRealtimeResponse | null;
};

export function createRealtimeResponseGate(): RealtimeResponseGate {
  return {
    assistantResponseInFlight: false,
    sequence: 0,
    activeAssistantResponseStartedSeq: null,
    activeAssistantResponseConfirmed: false,
    pendingCreateEventId: null,
    pendingCreateRequest: null,
    activeResponseId: null,
    supersededResponseId: null,
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
  eventId?: string,
  options: { forced?: boolean } = {},
): boolean {
  const forced = options.forced === true;
  if (gate.assistantResponseInFlight) {
    // Coalescing is last-wins except for instructions. A parameterless request
    // only asks the model to answer the conversation, which a deferred
    // instructed request already does, so it must not overwrite one. A queued
    // terminal message outranks anything that is not itself terminal.
    const deferred = gate.deferredAssistantResponse;
    const outranked = deferred?.forced === true && !forced;
    if (!outranked && (request !== undefined || deferred?.request === undefined)) {
      gate.deferredAssistantResponse = { request, forced };
    }
    return false;
  }

  gate.assistantResponseInFlight = true;
  gate.sequence += 1;
  gate.activeAssistantResponseStartedSeq = gate.sequence;
  gate.activeAssistantResponseConfirmed = false;
  gate.pendingCreateEventId = eventId ?? null;
  gate.pendingCreateRequest = { request, forced };
  gate.activeResponseId = null;
  gate.deferredAssistantResponse = null;
  return true;
}

export function markRealtimeResponseCreated(
  gate: RealtimeResponseGate,
  responseId?: string,
): void {
  // The server can also create a response on its own, after a voice-activity
  // turn the gate never saw a request for. One of those takes its place in the
  // order here, which is the earliest point the gate learns of it.
  gate.assistantResponseInFlight = true;
  gate.activeAssistantResponseConfirmed = true;
  gate.pendingCreateEventId = null;
  gate.pendingCreateRequest = null;
  gate.activeResponseId = responseId ?? null;
  if (gate.activeAssistantResponseStartedSeq === null) {
    gate.sequence += 1;
    gate.activeAssistantResponseStartedSeq = gate.sequence;
  }
}

// Clears the active response and returns the deferred request to post. A
// request whose only job was to answer conversation input is dropped when the
// finished response already covered that input; anything carrying its own
// instructions always posts.
export function takeDeferredRealtimeResponse(
  gate: RealtimeResponseGate,
  options: { responseId?: string; eventId?: string } = {},
): { post: boolean; request: RealtimeResponseRequest; forced: boolean } {
  const ignore = { post: false, request: undefined, forced: false };
  if (options.responseId !== undefined) {
    if (options.responseId === gate.supersededResponseId) {
      gate.supersededResponseId = null;
      // A terminal message posted with `force` supersedes a response that is
      // still finishing, and that response's `response.done` arrives
      // afterwards. It must not free the gate while the terminal message is
      // live — but if the terminal create was itself rejected and queued
      // behind this very response, its completion is what drains the queue.
      const terminalStillOutstanding =
        gate.activeResponseId !== null || gate.pendingCreateEventId !== null;
      if (terminalStillOutstanding) {
        return ignore;
      }
    } else if (
      // Any other response that is not the one being tracked. An unknown id
      // when nothing is tracked still releases, so a missed `response.created`
      // cannot strand the gate.
      gate.activeResponseId !== null &&
      options.responseId !== gate.activeResponseId
    ) {
      return ignore;
    }
  }

  const deferred = gate.deferredAssistantResponse;
  const startedSeq = gate.activeAssistantResponseStartedSeq;
  const inputSeq = gate.lastConversationInputSeq;

  gate.assistantResponseInFlight = false;
  gate.activeAssistantResponseStartedSeq = null;
  gate.activeAssistantResponseConfirmed = false;
  gate.pendingCreateEventId = null;
  gate.pendingCreateRequest = null;
  gate.activeResponseId = null;
  gate.deferredAssistantResponse = null;

  if (deferred === null) {
    return { post: false, request: undefined, forced: false };
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
      return { post: false, request: undefined, forced: false };
    }
  }

  gate.assistantResponseInFlight = true;
  gate.sequence += 1;
  gate.activeAssistantResponseStartedSeq = gate.sequence;
  gate.pendingCreateEventId = options.eventId ?? null;
  gate.pendingCreateRequest = deferred;
  return { post: true, request: deferred.request, forced: deferred.forced };
}

// The gate marks a response in flight the moment it is requested, before the
// server confirms it. If that request is rejected outright there will be no
// `response.done` to release the gate, which would strand every later turn.
// The error must name that create, though: a late error about some earlier
// client event — a `response.cancel` that had nothing left to cancel — would
// otherwise clear a healthy response and let the next request race it.
export function releaseUnconfirmedRealtimeResponse(
  gate: RealtimeResponseGate,
  eventId?: string,
): {
  released: boolean;
  post: boolean;
  request: RealtimeResponseRequest;
  forced: boolean;
} {
  const ignored = {
    released: false,
    post: false,
    request: undefined,
    forced: false,
  };
  if (!gate.assistantResponseInFlight) {
    return ignored;
  }
  if (gate.activeAssistantResponseConfirmed) {
    return ignored;
  }
  if (
    gate.pendingCreateEventId === null ||
    eventId !== gate.pendingCreateEventId
  ) {
    return ignored;
  }

  // The rejected create itself is not retried — the provider refused it — but
  // anything queued behind it is still unanswered and is handed back to post.
  const deferred = gate.deferredAssistantResponse;
  gate.assistantResponseInFlight = false;
  gate.activeAssistantResponseStartedSeq = null;
  gate.pendingCreateEventId = null;
  gate.pendingCreateRequest = null;
  gate.activeResponseId = null;
  gate.deferredAssistantResponse = null;

  if (deferred === null) {
    return { released: true, post: false, request: undefined, forced: false };
  }
  return {
    released: true,
    post: true,
    request: deferred.request,
    forced: deferred.forced,
  };
}

// A create rejected because a provider response is already active was never
// acted on, so its request is queued behind that response instead of being
// dropped. The gate stays closed; the active response's `response.done`
// releases it and posts what is queued.
export function requeueRejectedRealtimeCreate(
  gate: RealtimeResponseGate,
  eventId?: string,
): boolean {
  if (
    gate.pendingCreateEventId === null ||
    eventId !== gate.pendingCreateEventId
  ) {
    return false;
  }

  const rejected = gate.pendingCreateRequest;
  gate.pendingCreateEventId = null;
  gate.pendingCreateRequest = null;
  // The rejected create never took a place in the conversation, and the
  // response that displaced it is one the gate never saw start. There is no
  // position left to judge coverage against, so the queued request is answered
  // rather than assumed already covered.
  gate.activeAssistantResponseStartedSeq = null;
  if (rejected === null) {
    return false;
  }

  const deferred = gate.deferredAssistantResponse;
  // Whatever was queued behind the rejected create is newer, so it wins unless
  // the rejected request is terminal, or is the only one carrying instructions.
  if (deferred === null) {
    gate.deferredAssistantResponse = rejected;
  } else if (rejected.forced && !deferred.forced) {
    gate.deferredAssistantResponse = rejected;
  } else if (
    !deferred.forced &&
    deferred.request === undefined &&
    rejected.request !== undefined
  ) {
    gate.deferredAssistantResponse = rejected;
  }
  return true;
}

// A call that is ending or transferring must not start another turn. Whatever
// response was being tracked becomes superseded rather than forgotten, so its
// late `response.done` can still be told apart from the one replacing it.
export function resetRealtimeResponseGate(gate: RealtimeResponseGate): void {
  gate.supersededResponseId = gate.activeResponseId ?? gate.supersededResponseId;
  gate.assistantResponseInFlight = false;
  gate.activeAssistantResponseStartedSeq = null;
  gate.activeAssistantResponseConfirmed = false;
  gate.pendingCreateEventId = null;
  gate.pendingCreateRequest = null;
  gate.activeResponseId = null;
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
