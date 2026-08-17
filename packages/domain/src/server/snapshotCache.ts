import { snapshotSchema } from "@lobbystack/contracts";
import type { BusinessContextSnapshot } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { loadLatestBusinessSnapshot } from "./knowledge";

export const SNAPSHOT_CACHE_TTL_SECONDS = 300;

export type SnapshotCacheClient = {
  get(businessId: string): Promise<BusinessContextSnapshot | null>;
  set(businessId: string, snapshot: BusinessContextSnapshot): Promise<void>;
};

export function snapshotCacheKey(businessId: string): string {
  return `${process.env.REDIS_PREFIX ?? "lobbystack"}:widget:snapshot:${businessId}`;
}

export function serializeSnapshot(snapshot: BusinessContextSnapshot): string {
  return JSON.stringify(snapshot);
}

export function deserializeSnapshot(raw: string | null | undefined): BusinessContextSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = snapshotSchema.passthrough().safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as BusinessContextSnapshot) : null;
  } catch {
    return null;
  }
}

export function createInMemorySnapshotCache(options: { ttlMs?: number } = {}): SnapshotCacheClient {
  const ttlMs = options.ttlMs ?? SNAPSHOT_CACHE_TTL_SECONDS * 1_000;
  const store = new Map<string, { snapshot: BusinessContextSnapshot; expiresAt: number }>();

  return {
    async get(businessId) {
      const entry = store.get(businessId);
      if (!entry || entry.expiresAt <= Date.now()) {
        store.delete(businessId);
        return null;
      }
      return entry.snapshot;
    },
    async set(businessId, snapshot) {
      store.set(businessId, { snapshot, expiresAt: Date.now() + ttlMs });
    },
  };
}

export async function getCachedBusinessSnapshot(
  context: DomainContext,
  input: { businessId: string },
): Promise<BusinessContextSnapshot | null> {
  const cache = context.snapshotCache;
  if (!cache) {
    return await loadLatestBusinessSnapshot(context, { businessId: input.businessId });
  }
  const cached = await cache.get(input.businessId).catch(() => null);
  if (cached) return cached;
  const snapshot = await loadLatestBusinessSnapshot(context, { businessId: input.businessId });
  if (snapshot) {
    await cache.set(input.businessId, snapshot).catch(() => undefined);
  }
  return snapshot;
}


