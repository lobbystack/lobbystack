import "server-only";

import { createHash } from "node:crypto";

import Redis from "ioredis";

const COOLDOWN_SECONDS = 60;
const HOURLY_LIMIT = 3;
const IP_HOURLY_LIMIT = 10;
const HOURLY_TTL_SECONDS = 3_660;

let redis: Redis | undefined;

type EmailVerificationLimitStore = {
  set(key: string, value: string, expiryMode: "EX", ttl: number, setMode: "NX"): Promise<"OK" | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

export class EmailVerificationRateLimitError extends Error {
  constructor() {
    super("Please wait before requesting another verification code.");
  }
}

function recipientDigest(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export async function enforceEmailVerificationSendLimit(
  store: EmailVerificationLimitStore,
  input: { email: string; remoteIp?: string | null },
  hour = Math.floor(Date.now() / 3_600_000),
): Promise<void> {
  const prefix = process.env.REDIS_PREFIX ?? "lobbystack";
  const digest = recipientDigest(input.email);
  const cooldownKey = `${prefix}:email-verification:recipient:${digest}:cooldown`;
  const hourlyKey = `${prefix}:email-verification:recipient:${digest}:hour:${hour}`;
  const reserved = await store.set(cooldownKey, "1", "EX", COOLDOWN_SECONDS, "NX");
  if (reserved !== "OK") throw new EmailVerificationRateLimitError();

  const keys = [hourlyKey];
  if (input.remoteIp) keys.push(`${prefix}:email-verification:ip:${recipientDigest(input.remoteIp)}:hour:${hour}`);
  const counts = await Promise.all(keys.map(async (key) => {
    const count = await store.incr(key);
    if (count === 1) await store.expire(key, HOURLY_TTL_SECONDS);
    return count;
  }));
  if ((counts[0] ?? 0) > HOURLY_LIMIT || (counts[1] ?? 0) > IP_HOURLY_LIMIT) throw new EmailVerificationRateLimitError();
}

export async function assertEmailVerificationSendAllowed(input: { email: string; remoteIp?: string | null }): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") throw new Error("Email verification abuse protection is unavailable.");
    return;
  }
  redis ??= new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectionName: "lobbystack-admin:email-verification-limit",
  });
  if (redis.status === "wait") await redis.connect();
  await enforceEmailVerificationSendLimit(redis, input);
}
