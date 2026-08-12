import "server-only";

import Redis from "ioredis";

let redis: Redis | undefined;

export async function assertPhoneNumberSearchAllowed(input: { userId: string; initial: boolean }): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") throw new Error("Phone number search protection is unavailable.");
    return;
  }
  redis ??= new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableReadyCheck: true, connectionName: "lobbystack-admin:number-search-limit" });
  if (redis.status === "wait") await redis.connect();
  const window = Math.floor(Date.now() / 600_000);
  const key = `phone-number-search:${input.initial ? "initial" : "search"}:${input.userId}:${window}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 660);
  if (count > (input.initial ? 10 : 20)) throw new Error("Too many number searches. Try again later.");
}
