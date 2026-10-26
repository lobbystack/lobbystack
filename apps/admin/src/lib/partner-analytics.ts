import { isFreshPendingRecord } from "./pending-analytics";

const storageKey = "lobbystack.pending-partner-signup";

/** What web.partner.signup_succeeded reports, kept until the new partner's consent is known. */
export type PendingPartnerSignup = {
  partnerId: string;
  /** The signup page, where the event happened. */
  pathname: string;
  invited: boolean;
  subdomain: boolean;
};

/**
 * Defers the signup event until the new partner's console opens and its
 * telemetry setting is known. The signup page belongs to no partner yet, so
 * nothing there can consent for it.
 */
export function recordPendingPartnerSignup(signup: PendingPartnerSignup): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ ...signup, createdAt: Date.now() }));
  } catch {
    // Analytics must never prevent partner signup.
  }
}

/** The queued signup of the partner whose console is open, once. Another partner's stays queued. */
export function consumePendingPartnerSignup(expectedPartnerId: string): PendingPartnerSignup | null {
  try {
    const value = window.sessionStorage.getItem(storageKey);
    if (!value) return null;
    const record = JSON.parse(value) as Partial<PendingPartnerSignup> & { createdAt?: unknown };
    if (typeof record.partnerId !== "string" || record.partnerId.length === 0 || typeof record.pathname !== "string" || typeof record.invited !== "boolean" || typeof record.subdomain !== "boolean" || !isFreshPendingRecord(record)) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    if (record.partnerId !== expectedPartnerId) return null;
    window.sessionStorage.removeItem(storageKey);
    return { partnerId: record.partnerId, pathname: record.pathname, invited: record.invited, subdomain: record.subdomain };
  } catch {
    return null;
  }
}
