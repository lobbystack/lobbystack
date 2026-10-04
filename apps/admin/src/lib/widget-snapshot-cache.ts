import { redisSnapshotCache, type SnapshotCacheClient } from "@lobbystack/domain";
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

export const getAdminSnapshotCache = (): SnapshotCacheClient => redisSnapshotCache(getRedis);
