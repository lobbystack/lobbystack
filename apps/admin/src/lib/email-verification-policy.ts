import "server-only";

import { createHash } from "node:crypto";

import Redis from "ioredis";

const COOLDOWN_SECONDS = 60;
const HOURLY_LIMIT = 3;
const IP_HOURLY_LIMIT = 10;
const HOURLY_TTL_SECONDS = 3_660;

let redis: Redis | undefined;

type EmailVerificationLimitStore = {
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
};

// Check and reserve in one operation: rejected attempts consume no extra quota,
// and a process failure cannot leave a counter without its expiry.
const reserveScript = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
for i = 2, #KEYS do
  if tonumber(redis.call('GET', KEYS[i]) or '0') >= tonumber(ARGV[i + 1]) then return 0 end
end
redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
for i = 2, #KEYS do
  if redis.call('INCR', KEYS[i]) == 1 then redis.call('EXPIRE', KEYS[i], ARGV[2]) end
end
return 1`;

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
  const keys = [cooldownKey, hourlyKey];
  if (input.remoteIp) keys.push(`${prefix}:email-verification:ip:${recipientDigest(input.remoteIp)}:hour:${hour}`);
  const accepted = await store.eval(reserveScript, keys.length, ...keys, COOLDOWN_SECONDS, HOURLY_TTL_SECONDS, HOURLY_LIMIT, IP_HOURLY_LIMIT);
  if (Number(accepted) !== 1) throw new EmailVerificationRateLimitError();
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
