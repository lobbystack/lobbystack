import { redisSnapshotCache, type SnapshotCacheClient } from "@lobbystack/domain";

import { getRedis } from "./redis";

export const getAdminSnapshotCache = (): SnapshotCacheClient => redisSnapshotCache(getRedis);
