import { deserializeSnapshot, serializeSnapshot, snapshotCacheKey, SNAPSHOT_CACHE_TTL_SECONDS, type SnapshotCacheClient } from "@lobbystack/domain";
import type { BusinessContextSnapshot } from "@lobbystack/shared";
import Redis from "ioredis";

let redis: Redis | undefined;

export async function closeAdminSnapshotCache(): Promise<void> {
  const store = redis;
  redis = undefined;
  if (store) await store.quit().catch(() => store.disconnect());
}

function getRedis(): Redis | undefined {
  const url = process.env.REDIS_URL;
  if (!url) return undefined;
  if (!redis) {
    redis = new Redis(url, {
      connectionName: `${process.env.REDIS_PREFIX ?? "lobbystack"}:admin-snapshot`,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    redis.on("error", () => undefined);
  }
  return redis;
}

export const getAdminSnapshotCache = (): SnapshotCacheClient => ({
  async get(businessId) {
    const store = getRedis();
    if (!store) return null;
    const raw = await store.get(snapshotCacheKey(businessId)).catch(() => null);
    return deserializeSnapshot(raw ?? undefined);
  },
  async set(businessId, snapshot: BusinessContextSnapshot) {
    const store = getRedis();
    if (!store) return;
    await store.set(snapshotCacheKey(businessId), serializeSnapshot(snapshot), "EX", SNAPSHOT_CACHE_TTL_SECONDS).catch(() => undefined);
  },
});
