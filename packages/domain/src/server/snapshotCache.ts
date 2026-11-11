import { snapshotSchema } from "@lobbystack/contracts";
import type { BusinessContextSnapshot } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { isCurrentSnapshot, snapshotForAgent } from "../snapshot";
import { loadLatestBusinessSnapshot, loadSnapshotAgent, refreshBusinessSnapshot } from "./knowledge";

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

/**
 * The business's newest snapshot, from the cache when it holds a current one.
 * A snapshot older code built (see isCurrentSnapshot) is rebuilt first, so a
 * rule kept to one channel never reaches the others. When the rebuild fails,
 * the old snapshot is better than none and comes back.
 */
export async function getCachedBusinessSnapshot(
  context: DomainContext,
  input: { businessId: string },
): Promise<BusinessContextSnapshot | null> {
  const cache = context.snapshotCache;
  const cached = cache ? await cache.get(input.businessId).catch(() => null) : null;
  if (cached && isCurrentSnapshot(cached)) return cached;
  const snapshot = await loadLatestBusinessSnapshot(context, { businessId: input.businessId });
  if (snapshot && !isCurrentSnapshot(snapshot)) {
    try {
      // The refresh writes the cache through.
      await refreshBusinessSnapshot(context, { businessId: input.businessId });
      return await loadLatestBusinessSnapshot(context, { businessId: input.businessId }) ?? snapshot;
    } catch (error) {
      console.error("[snapshot] rebuilding a snapshot older code built failed", input.businessId, error instanceof Error ? error.message : error);
      return snapshot;
    }
  }
  if (snapshot && cache) {
    await cache.set(input.businessId, snapshot).catch(() => undefined);
  }
  return snapshot;
}

/**
 * The snapshot projected for one agent, or the default agent when agentId is
 * absent. A snapshot that doesn't list the agent gets one refresh, because an
 * agent or a channel move can reach a call before its refresh job does. If the
 * agent is still missing, this logs an error and returns the default agent, so
 * the call still gets answered. Null only when the business has no snapshot.
 *
 * `loaded` is a snapshot the caller already has, so a call that loaded it next
 * to other work makes no second read. `underWay` says a call has started on
 * this agent: an agent archived since then is read from its row, so the call
 * finishes as the agent it started as.
 */
export async function getBusinessSnapshotForAgent(
  context: DomainContext,
  input: { businessId: string; agentId?: string | null | undefined; loaded?: BusinessContextSnapshot; underWay?: boolean },
): Promise<BusinessContextSnapshot | null> {
  const cached = input.loaded && isCurrentSnapshot(input.loaded) ? input.loaded : await getCachedBusinessSnapshot(context, { businessId: input.businessId });
  if (cached && !input.agentId) return cached;
  if (cached?.agents?.some((agent) => agent.id === input.agentId)) return snapshotForAgent(cached, input.agentId);

  let snapshot = cached;
  try {
    await refreshBusinessSnapshot(context, { businessId: input.businessId });
    // Read past the cache: its write-through can fail and leave the stale copy.
    snapshot = await loadLatestBusinessSnapshot(context, { businessId: input.businessId }) ?? cached;
  } catch (error) {
    if (!cached) throw error;
    console.error("[snapshot] refresh for an agent failed", input.businessId, input.agentId, error instanceof Error ? error.message : error);
  }
  if (!snapshot || !input.agentId) return snapshot;
  if (snapshot.agents?.some((agent) => agent.id === input.agentId)) return snapshotForAgent(snapshot, input.agentId);
  if (input.underWay) {
    const agent = await loadSnapshotAgent(context, { businessId: input.businessId, agentId: input.agentId, business: snapshot }).catch((error: unknown) => {
      console.error("[snapshot] couldn't read an agent for a call under way", input.businessId, input.agentId, error instanceof Error ? error.message : error);
      return null;
    });
    if (agent) return snapshotForAgent({ ...snapshot, agents: [...(snapshot.agents ?? []), agent] }, input.agentId);
  }
  console.error("[snapshot] unknown agent, answering as the default agent", input.businessId, input.agentId);
  return snapshot;
}
