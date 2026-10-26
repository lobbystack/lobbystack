import Redis from "ioredis";
import { brandChangesChannel, encodeBrandChange, listenForBrandChanges, type BrandChangePublisher } from "@lobbystack/domain";

import { reportServerError } from "./error-reporting";
import { readyRedis } from "./redis";

// Brand changes reach every admin and worker process through one Redis
// channel, so a partner's saved brand shows everywhere at once instead of when
// each process's 30-second cache runs out. Without REDIS_URL the cache alone
// carries a change.

/** Announces a brand change on the channel every process listens on. */
export const redisBrandChanges: BrandChangePublisher = {
  publish: async (change) => {
    const redis = await readyRedis();
    await redis?.publish(brandChangesChannel(), encodeBrandChange(change));
  },
};

let listening = false;

/**
 * Starts listening for brand changes in this module's copy of the brand cache,
 * once. The proxy and the route handlers are separate bundles with a cache
 * each, so each starts its own listener the first time it resolves a brand.
 */
export function listenForBrandChangesOnce(): void {
  const url = process.env.REDIS_URL;
  // A build has no other process to hear from, and an open connection would keep it running.
  if (listening || !url || process.env.NEXT_PHASE === "phase-production-build") return;
  listening = true;
  // A connection that subscribes runs nothing else. It queues the subscription
  // while Redis is down and subscribes again after every reconnect.
  const subscriber = new Redis(url, {
    protocol: 2,
    lazyConnect: true,
    maxRetriesPerRequest: null,
    connectionName: `${process.env.REDIS_PREFIX ?? "lobbystack"}:admin-brands`,
  });
  subscriber.on("error", () => undefined);
  listenForBrandChanges(subscriber).catch((error: unknown) => {
    listening = false;
    subscriber.disconnect();
    void reportServerError(error, { operation: "listen_for_brand_changes" });
  });
}
