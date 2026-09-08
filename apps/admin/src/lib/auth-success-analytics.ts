type AuthSuccessEvent = "web.auth.login_succeeded" | "web.auth.signup_succeeded";
const storageKey = "lobbystack.pending-auth-success";

/** Defer the event across auth's full navigation until tenant telemetry consent is known. */
export function recordAuthSuccess(event: AuthSuccessEvent): void {
  try { window.sessionStorage.setItem(storageKey, JSON.stringify({ event, createdAt: Date.now() })); } catch { /* Analytics must never prevent authentication. */ }
}

export function consumeAuthSuccess(): AuthSuccessEvent | null {
  try {
    const value = window.sessionStorage.getItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
    if (!value) return null;
    const record = JSON.parse(value) as { event?: unknown; createdAt?: unknown };
    if (record.event !== "web.auth.login_succeeded" && record.event !== "web.auth.signup_succeeded") return null;
    if (typeof record.createdAt !== "number" || Date.now() - record.createdAt < 0 || Date.now() - record.createdAt > 10 * 60_000) return null;
    return record.event;
  } catch { return null; }
}
