type AuthSuccessEvent = "web.auth.login_succeeded" | "web.auth.signup_succeeded";
export const authSuccessSources = ["calculator"] as const;
export type AuthSuccessSource = (typeof authSuccessSources)[number];

export type ConsumedAuthSuccess = {
  event: AuthSuccessEvent;
  source?: AuthSuccessSource;
};

const storageKey = "lobbystack.pending-auth-success";

function isAuthSuccessSource(value: unknown): value is AuthSuccessSource {
  return typeof value === "string" && (authSuccessSources as readonly string[]).includes(value);
}

/** Defer the event across auth's full navigation until tenant telemetry consent is known. */
export function recordAuthSuccess(event: AuthSuccessEvent, options: { source?: AuthSuccessSource } = {}): void {
  try { window.sessionStorage.setItem(storageKey, JSON.stringify({ event, ...(options.source ? { source: options.source } : {}), createdAt: Date.now() })); } catch { /* Analytics must never prevent authentication. */ }
}

export function consumeAuthSuccess(): ConsumedAuthSuccess | null {
  try {
    const value = window.sessionStorage.getItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
    if (!value) return null;
    const record = JSON.parse(value) as { event?: unknown; source?: unknown; createdAt?: unknown };
    if (record.event !== "web.auth.login_succeeded" && record.event !== "web.auth.signup_succeeded") return null;
    if (typeof record.createdAt !== "number" || Date.now() - record.createdAt < 0 || Date.now() - record.createdAt > 10 * 60_000) return null;
    return { event: record.event, ...(isAuthSuccessSource(record.source) ? { source: record.source } : {}) };
  } catch { return null; }
}
