import { deserializeSnapshot, serializeSnapshot, snapshotCacheKey, SNAPSHOT_CACHE_TTL_SECONDS, type SnapshotCacheClient } from "@lobbystack/domain";
import type { BusinessContextSnapshot } from "@lobbystack/shared";

import { createRedisConnection } from "@lobbystack/jobs";

let store: ReturnType<typeof createRedisConnection> | undefined;

export function getWorkerSnapshotCache(): SnapshotCacheClient {
  if (!store) {
    store = createRedisConnection({ prefix: process.env.REDIS_PREFIX ?? "lobbystack" });
    store.on("error", () => undefined);
  }
  const connection = store;
  return {
    async get(businessId) {
      const raw = await connection.get(snapshotCacheKey(businessId)).catch(() => null);
      return deserializeSnapshot(raw ?? undefined);
    },
    async set(businessId, snapshot: BusinessContextSnapshot) {
      await connection.set(snapshotCacheKey(businessId), serializeSnapshot(snapshot), "EX", SNAPSHOT_CACHE_TTL_SECONDS).catch(() => undefined);
    },
  };
}
