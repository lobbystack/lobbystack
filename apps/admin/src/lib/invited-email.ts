// The address an invitation was sent to, carried from its accept page to the
// sign-up or sign-in form it links to, so the form starts filled in. It stays
// out of the URL and lasts ten minutes in this tab.

const KEY = "auth-invited-email";
const LIFETIME_MS = 10 * 60_000;

export function rememberInvitedEmail(email: string | null | undefined): void {
  if (!email) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email, expires: Date.now() + LIFETIME_MS }));
  } catch { /* Storage can be unavailable; the form still works empty. */ }
}

/** The remembered address, once: reading it forgets it. */
export function takeInvitedEmail(): string | null {
  try {
    const saved = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!saved) return null;
    const invited = JSON.parse(saved) as { email?: unknown; expires?: number };
    return typeof invited.email === "string" && (invited.expires ?? 0) > Date.now() ? invited.email : null;
  } catch {
    return null;
  }
}
