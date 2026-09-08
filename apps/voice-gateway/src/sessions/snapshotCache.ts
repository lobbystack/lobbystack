import type { BusinessContextSnapshot } from "@lobbystack/shared";

export function createSnapshotCache(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}): {
  get: (businessId: string) => BusinessContextSnapshot | null;
  set: (businessId: string, snapshot: BusinessContextSnapshot) => void;
} {
  const ttlMs = options.ttlMs ?? 300_000;
  const maxEntries = options.maxEntries ?? 1_000;
  const now = options.now ?? Date.now;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || !Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Snapshot cache requires positive TTL and capacity.");
  }
  const store = new Map<string, { snapshot: BusinessContextSnapshot; expiresAt: number }>();

  return {
    get(businessId) {
      const entry = store.get(businessId);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        store.delete(businessId);
        return null;
      }
      // LRU order changes on access, but reading never extends freshness.
      store.delete(businessId);
      store.set(businessId, entry);
      return entry.snapshot;
    },
    set(businessId, snapshot) {
      store.delete(businessId);
      store.set(businessId, { snapshot, expiresAt: now() + ttlMs });
      while (store.size > maxEntries) store.delete(store.keys().next().value!);
    },
  };
}
