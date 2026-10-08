import Redis from "ioredis";

let redis: Redis | undefined;

/** The admin's shared Redis client, or undefined when REDIS_URL is not set. */
export function getRedis(): Redis | undefined {
  const url = process.env.REDIS_URL;
  if (!url) return undefined;
  if (!redis) {
    redis = new Redis(url, {
      // ioredis 6 defaults to RESP3. Stay on RESP2, like the worker's connections.
      protocol: 2,
      connectionName: `${process.env.REDIS_PREFIX ?? "lobbystack"}:admin`,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    redis.on("error", () => undefined);
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  const store = redis;
  redis = undefined;
  if (store) await store.quit().catch(() => store.disconnect());
}

/** Connects the client on first use and waits until it is ready, failing fast when it cannot be. */
export async function waitForRedis(store: Redis): Promise<void> {
  if (store.status === "ready") return;
  if (store.status === "end") throw new Error("Redis is unavailable.");
  if (store.status === "wait") {
    await store.connect();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      store.off("ready", onReady);
      store.off("error", onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Redis readiness timed out.")); }, 2_500);
    timeout.unref?.();
    store.once("ready", onReady);
    store.once("error", onError);
  });
}

/** The shared client once it is ready, or undefined when REDIS_URL is not set. */
export async function readyRedis(): Promise<Redis | undefined> {
  const store = getRedis();
  if (store) await waitForRedis(store);
  return store;
}
