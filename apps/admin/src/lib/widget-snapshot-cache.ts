import { loadLatestBusinessSnapshot, type DomainContext } from "@lobbystack/domain";
import type { BusinessContextSnapshot } from "@lobbystack/shared";

const DEFAULT_TTL_MS = 5 * 60 * 1_000;

export type SnapshotLoader = (context: DomainContext, input: { businessId: string }) => Promise<BusinessContextSnapshot | null>;

type CacheEntry = { snapshot: BusinessContextSnapshot; expiresAt: number };

export type WidgetSnapshotCache = {
  get(context: DomainContext, input: { businessId: string }): Promise<BusinessContextSnapshot | null>;
  clear(): void;
};

export function createWidgetSnapshotCache(options: { ttlMs?: number; load?: SnapshotLoader } = {}): WidgetSnapshotCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const load: SnapshotLoader = options.load ?? loadLatestBusinessSnapshot;
  const store = new Map<string, CacheEntry>();

  return {
    async get(context, input) {
      const cached = store.get(input.businessId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.snapshot;
      }
      const snapshot = await load(context, { businessId: input.businessId });
      if (snapshot) {
        store.set(input.businessId, { snapshot, expiresAt: Date.now() + ttlMs });
      } else {
        store.delete(input.businessId);
      }
      return snapshot;
    },
    clear() {
      store.clear();
    },
  };
}

export const widgetSnapshotCache: WidgetSnapshotCache = createWidgetSnapshotCache();
