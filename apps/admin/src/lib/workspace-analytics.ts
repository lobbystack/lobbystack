const storageKey = "lobbystack.pending-workspace-switch";

type PendingWorkspaceSwitch = {
  businessId: string;
  previousBusinessId: string;
  createdAt: number;
};

/** Defer switch analytics until the destination workspace's telemetry consent is known. */
export function recordPendingWorkspaceSwitch(businessId: string, previousBusinessId: string): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ businessId, previousBusinessId, createdAt: Date.now() }));
  } catch {
    // Analytics must never prevent workspace switching.
  }
}

export function consumePendingWorkspaceSwitch(expectedBusinessId?: string): PendingWorkspaceSwitch | null {
  try {
    const value = window.sessionStorage.getItem(storageKey);
    if (!value) return null;
    const record = JSON.parse(value) as Partial<PendingWorkspaceSwitch>;
    if (typeof record.businessId !== "string" || record.businessId.length === 0 || typeof record.previousBusinessId !== "string" || record.previousBusinessId.length === 0 || typeof record.createdAt !== "number" || Date.now() - record.createdAt < 0 || Date.now() - record.createdAt > 10 * 60_000) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    if (expectedBusinessId && record.businessId !== expectedBusinessId) return null;
    window.sessionStorage.removeItem(storageKey);
    return record as PendingWorkspaceSwitch;
  } catch {
    return null;
  }
}
