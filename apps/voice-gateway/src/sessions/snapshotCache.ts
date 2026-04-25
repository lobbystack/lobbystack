import type { BusinessContextSnapshot } from "@lobbystack/shared";

export function createSnapshotCache(): {
  get: (businessId: string) => BusinessContextSnapshot | null;
  set: (businessId: string, snapshot: BusinessContextSnapshot) => void;
} {
  const store = new Map<string, BusinessContextSnapshot>();

  return {
    get(businessId) {
      return store.get(businessId) ?? null;
    },
    set(businessId, snapshot) {
      store.set(businessId, snapshot);
    },
  };
}
