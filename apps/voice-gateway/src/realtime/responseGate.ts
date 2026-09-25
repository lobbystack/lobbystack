// OpenAI Realtime allows one active response per conversation. When the model
// emits parallel function calls, each tool completion independently wants to
// post `response.create`, and every request after the first is rejected with
// `conversation_already_has_active_response`. This gate serializes those
// requests instead: the first one is posted, the rest coalesce into a single
// deferred request that is re-issued once the active response finishes.
//
// The gate is a state machine rather than a bag of flags, because the states
// carry different evidence and mixing them is what produces wedged calls and
// dropped turns. Each field lives only in the state that can justify it.

export type RealtimeResponseRequest = Record<string, unknown> | undefined;

// Wrapping the request keeps "nothing queued" (null) distinct from "a queued
// request that carries no options", which is what an ordinary tool completion
// asks for. `forced` marks a terminal message, which outranks every ordinary
// request and survives the checks that stop a call starting new turns.
type PendingRequest = {
  request: RealtimeResponseRequest;
  forced: boolean;
};

type GateStatus =
  // Nothing outstanding. The next request posts immediately.
  | { kind: "idle" }
  // A create was posted and the provider has not acknowledged it yet.
  | {
      kind: "requested";
      eventId: string | null;
      pending: PendingRequest;
      startedSeq: number;
    }
  // The provider acknowledged a response, ours or one server turn detection
  // started on its own.
  | { kind: "active"; responseId: string | null; startedSeq: number }
  // Our create was rejected because a response was already running. That
  // response is real but the gate never learned its id, and carries no
  // position of its own — which is why this state has no `startedSeq`, and a
  // queued request behind it can never be mistaken for already answered.
  | { kind: "queued" };

export type RealtimeResponseGateStatus = GateStatus["kind"];

export type RealtimeResponseGate = {
  status: GateStatus;
  // Ordering runs on a counter, not a clock. Adjacent promise continuations
  // land in the same millisecond, and `Date.now()` cannot then tell a tool
  // output sent after a `response.create` from one sent before it.
  sequence: number;
  lastConversationInputSeq: number | null;
  // The response a forced terminal message replaced. Its `response.done` still
  // arrives afterwards and must not release the message that replaced it.
  supersededResponseId: string | null;
  deferred: PendingRequest | null;
};

export function createRealtimeResponseGate(): RealtimeResponseGate {
  return {
    status: { kind: "idle" },
    sequence: 0,
    lastConversationInputSeq: null,
    supersededResponseId: null,
    deferred: null,
  };
}

export function isRealtimeResponseInFlight(gate: RealtimeResponseGate): boolean {
  return gate.status.kind !== "idle";
}

export function getRealtimeResponseGateStatus(
  gate: RealtimeResponseGate,
): RealtimeResponseGateStatus {
  return gate.status.kind;
}

export function peekDeferredRealtimeResponse(
  gate: RealtimeResponseGate,
): { request: RealtimeResponseRequest; forced: boolean } | null {
  return gate.deferred;
}

function nextSequence(gate: RealtimeResponseGate): number {
  gate.sequence += 1;
  return gate.sequence;
}

// The position of whatever the gate is waiting on, when it has one. `queued`
// deliberately has none.
function startedSequenceOf(status: GateStatus): number | null {
  return status.kind === "requested" || status.kind === "active"
    ? status.startedSeq
    : null;
}

// A newer request replaces what is queued, except that a terminal message
// cannot be displaced by an ordinary one, and a bare "answer the conversation"
// request cannot displace one carrying its own instructions.
function enqueueBehindNewer(
  gate: RealtimeResponseGate,
  candidate: PendingRequest,
): void {
  const deferred = gate.deferred;
  if (deferred !== null && deferred.forced && !candidate.forced) {
    return;
  }
  if (candidate.request === undefined && deferred?.request !== undefined) {
    return;
  }
  gate.deferred = candidate;
}

// The mirror of the above for a create that was rejected: it is older than
// whatever queued up behind it, so it only wins on the same two grounds.
function enqueueBehindOlder(
  gate: RealtimeResponseGate,
  rejected: PendingRequest,
): void {
  const deferred = gate.deferred;
  if (deferred === null) {
    gate.deferred = rejected;
    return;
  }
  if (rejected.forced && !deferred.forced) {
    gate.deferred = rejected;
    return;
  }
  if (
    !deferred.forced &&
    deferred.request === undefined &&
    rejected.request !== undefined
  ) {
    gate.deferred = rejected;
  }
}

// Records a conversation item the assistant still owes an answer for, such as a
// `function_call_output`. Its place in the order is what later distinguishes
// input the active response could not have seen from input it already saw.
export function markRealtimeConversationInput(
  gate: RealtimeResponseGate,
): void {
  gate.lastConversationInputSeq = nextSequence(gate);
}

// Returns true when the caller should post the request now. A false return
// means the request was queued and will be reconsidered on `response.done`.
export function requestRealtimeResponse(
  gate: RealtimeResponseGate,
  request: RealtimeResponseRequest,
  eventId?: string,
  options: { forced?: boolean } = {},
): boolean {
  const candidate: PendingRequest = { request, forced: options.forced === true };

  if (gate.status.kind !== "idle") {
    enqueueBehindNewer(gate, candidate);
    return false;
  }

  gate.status = {
    kind: "requested",
    eventId: eventId ?? null,
    pending: candidate,
    startedSeq: nextSequence(gate),
  };
  gate.deferred = null;
  return true;
}

export function markRealtimeResponseCreated(
  gate: RealtimeResponseGate,
  responseId?: string,
): void {
  // A response the gate asked for keeps the position of its request, since the
  // provider ordered the conversation by what it received. One the server
  // started on its own has no request to borrow from, so it takes its place
  // here, the earliest point the gate learns of it.
  const startedSeq = startedSequenceOf(gate.status) ?? nextSequence(gate);
  gate.status = { kind: "active", responseId: responseId ?? null, startedSeq };
}

// Releases the response that just finished and returns the queued request to
// post. A request whose only job was to answer conversation input is dropped
// when the finished response already covered that input; anything carrying its
// own instructions always posts.
export function takeDeferredRealtimeResponse(
  gate: RealtimeResponseGate,
  options: { responseId?: string; eventId?: string } = {},
): { post: boolean; request: RealtimeResponseRequest; forced: boolean } {
  const ignore = { post: false, request: undefined, forced: false };
  const status = gate.status;

  if (options.responseId !== undefined) {
    if (options.responseId === gate.supersededResponseId) {
      gate.supersededResponseId = null;
      // A terminal message posted with `force` supersedes a response that is
      // still finishing, and that response's `response.done` arrives
      // afterwards. It must not free the gate while the terminal message is
      // live — but if the terminal create was itself rejected and queued
      // behind this very response, its completion is what drains the queue.
      if (status.kind === "requested" || status.kind === "active") {
        return ignore;
      }
    } else if (
      // Any other response that is not the one being tracked. An unknown id
      // when nothing is tracked still releases, so a missed `response.created`
      // cannot strand the gate.
      status.kind === "active" &&
      status.responseId !== null &&
      options.responseId !== status.responseId
    ) {
      return ignore;
    }
  }

  const deferred = gate.deferred;
  const startedSeq = startedSequenceOf(status);
  gate.status = { kind: "idle" };
  gate.deferred = null;

  if (deferred === null) {
    return ignore;
  }

  if (deferred.request === undefined) {
    // Without a position there is no evidence the finished response saw the
    // newer input, so answering it is the safer side of the trade.
    const answeredInput =
      startedSeq !== null &&
      gate.lastConversationInputSeq !== null &&
      gate.lastConversationInputSeq <= startedSeq;
    if (answeredInput) {
      return ignore;
    }
  }

  gate.status = {
    kind: "requested",
    eventId: options.eventId ?? null,
    pending: deferred,
    startedSeq: nextSequence(gate),
  };
  return { post: true, request: deferred.request, forced: deferred.forced };
}

// The gate marks a response outstanding the moment it is requested, before the
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
  const status = gate.status;
  if (status.kind !== "requested") {
    return ignored;
  }
  if (status.eventId === null || eventId !== status.eventId) {
    return ignored;
  }

  // The rejected create itself is not retried — the provider refused it — but
  // anything queued behind it is still unanswered and is handed back to post.
  const deferred = gate.deferred;
  gate.status = { kind: "idle" };
  gate.deferred = null;

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
  const status = gate.status;
  if (status.kind !== "requested") {
    return false;
  }
  if (status.eventId === null || eventId !== status.eventId) {
    return false;
  }

  const rejected = status.pending;
  gate.status = { kind: "queued" };
  enqueueBehindOlder(gate, rejected);
  return true;
}

// A call that is ending or transferring must not start another turn. Whatever
// response was being tracked becomes superseded rather than forgotten, so its
// late `response.done` can still be told apart from the one replacing it.
export function resetRealtimeResponseGate(gate: RealtimeResponseGate): void {
  const status = gate.status;
  if (status.kind === "active" && status.responseId !== null) {
    gate.supersededResponseId = status.responseId;
  }
  gate.status = { kind: "idle" };
  gate.lastConversationInputSeq = null;
  gate.deferred = null;
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
