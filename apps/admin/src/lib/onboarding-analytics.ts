import { isFreshPendingRecord } from "./pending-analytics";

const storageKey = "lobbystack.pending-onboarding-business";

/** Defer first-workspace analytics until that workspace's telemetry consent is known. */
export function recordPendingOnboardingBusiness(businessId: string): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ businessId, createdAt: Date.now() }));
  } catch {
    // Analytics must never prevent onboarding.
  }
}

export function consumePendingOnboardingBusiness(expectedBusinessId?: string): string | null {
  try {
    const value = window.sessionStorage.getItem(storageKey);
    if (!value) return null;
    const record = JSON.parse(value) as { businessId?: unknown; createdAt?: unknown };
    if (typeof record.businessId !== "string" || record.businessId.length === 0 || !isFreshPendingRecord(record)) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    if (expectedBusinessId && record.businessId !== expectedBusinessId) return null;
    window.sessionStorage.removeItem(storageKey);
    return record.businessId;
  } catch {
    return null;
  }
}
