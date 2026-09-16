import "server-only";

import Redis from "ioredis";

let redis: Redis | undefined;

type FeedbackRateLimitStore = Pick<Redis, "incr" | "expire">;

export async function enforceFeedbackRateLimit(
  store: FeedbackRateLimitStore,
  input: { userId: string; businessId?: string },
  window = Math.floor(Date.now() / 3_600_000),
): Promise<void> {
  const keys = [`feedback:user:${input.userId}:${window}`];
  if (input.businessId) keys.push(`feedback:business:${input.businessId}:${window}`);
  const counts = await Promise.all(keys.map(async (key) => {
    const count = await store.incr(key);
    if (count === 1) await store.expire(key, 3_660);
    return count;
  }));
  if ((counts[0] ?? 0) > 10 || (counts[1] ?? 0) > 50) throw new Error("Too many feedback submissions. Please try again later.");
}

export async function assertFeedbackSubmissionAllowed(input: { userId: string; businessId?: string }): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") throw new Error("Feedback abuse protection is unavailable.");
    return;
  }
  redis ??= new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableReadyCheck: true, connectionName: "lobbystack-admin:feedback-limit" });
  if (redis.status === "wait") await redis.connect();
  await enforceFeedbackRateLimit(redis, input);
}
