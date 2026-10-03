import type Redis from "ioredis";

const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Logs a Redis client's connection errors, at most once every 30 seconds while
 * an outage lasts. ioredis reconnects on its own; without a listener it prints
 * every failed attempt as an unhandled error event.
 */
export function logRedisErrors(client: Redis, name: string): Redis {
  let lastLoggedAt = 0;
  client.on("error", (error: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) return;
    lastLoggedAt = now;
    console.error(JSON.stringify({ event: "redis.error", connection: name, message: error.message }));
  });
  return client;
}
