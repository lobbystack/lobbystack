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

export function deserializeSnapshot(raw: string | null | undefined): BusinessContextSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = snapshotSchema.loose().safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as BusinessContextSnapshot) : null;
  } catch {
    return null;
  }
}

/** The slice of an ioredis client the snapshot cache uses. */
export type SnapshotRedis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
};

/**
 * A snapshot cache over Redis. `redis` is resolved on every call; a missing
 * client or a Redis error reads as a miss and drops the write.
 */
export function redisSnapshotCache(redis: () => SnapshotRedis | undefined): SnapshotCacheClient {
  return {
    async get(businessId) {
      return deserializeSnapshot(await redis()?.get(snapshotCacheKey(businessId)).catch(() => null));
    },
    async set(businessId, snapshot) {
      await redis()?.set(snapshotCacheKey(businessId), JSON.stringify(snapshot), "EX", SNAPSHOT_CACHE_TTL_SECONDS).catch(() => undefined);
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
