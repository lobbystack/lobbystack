import { redisSnapshotCache, type SnapshotCacheClient } from "@lobbystack/domain";

import { createRedisConnection } from "@lobbystack/jobs";

let store: ReturnType<typeof createRedisConnection> | undefined;

export function getWorkerSnapshotCache(): SnapshotCacheClient {
  if (!store) {
    store = createRedisConnection({ prefix: process.env.REDIS_PREFIX ?? "lobbystack" });
    store.on("error", () => undefined);
  }
  const connection = store;
  return redisSnapshotCache(() => connection);
}
