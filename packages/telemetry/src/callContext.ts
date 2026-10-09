import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The call the running code works on. Logs, error reports and spans made
 * inside withCallContext() carry these IDs, so everything about one call can
 * be found by any of them.
 */
export type CallContext = {
  /** The call's row in `calls`. */
  callId?: string;
  /** The GPT-Live session, which is also the call's provider ID. */
  sessionId?: string;
  businessId?: string;
  /** Twilio's ID for the phone leg, from the SIP INVITE. */
  twilioCallSid?: string;
};

const CALL_CONTEXT_KEYS = ["callId", "sessionId", "businessId", "twilioCallSid"] as const;

/** Where each ID goes on a span. */
export const CALL_CONTEXT_SPAN_ATTRIBUTES = {
  callId: "lobbystack.call_id",
  sessionId: "lobbystack.session_id",
  businessId: "lobbystack.business_id",
  twilioCallSid: "lobbystack.twilio_call_sid",
} as const satisfies Record<keyof CallContext, string>;

// One store per process, even when a bundle loads this module twice.
const holder = globalThis as unknown as { __lobbystackCallContext?: AsyncLocalStorage<CallContext> };
const storage = holder.__lobbystackCallContext ??= new AsyncLocalStorage<CallContext>();

function presentIds(ids: CallContext): CallContext {
  const present: CallContext = {};
  for (const key of CALL_CONTEXT_KEYS) {
    const value = ids[key];
    if (typeof value === "string" && value) present[key] = value;
  }
  return present;
}

/** Runs the callback with these IDs added to the current call's. Work it starts, timers and sockets included, keeps them. */
export function withCallContext<T>(ids: CallContext, callback: () => T): T {
  return storage.run({ ...storage.getStore(), ...presentIds(ids) }, callback);
}

/** Adds IDs learned along the way, such as the call ID once the call is saved. Does nothing outside withCallContext(). */
export function addIdsToCallContext(ids: CallContext): void {
  const store = storage.getStore();
  if (store) Object.assign(store, presentIds(ids));
}

export function currentCallContext(): CallContext {
  return { ...storage.getStore() };
}

export function callContextSpanAttributes(ids: CallContext): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(presentIds(ids))) {
    attributes[CALL_CONTEXT_SPAN_ATTRIBUTES[key as keyof CallContext]] = value;
  }
  return attributes;
}
