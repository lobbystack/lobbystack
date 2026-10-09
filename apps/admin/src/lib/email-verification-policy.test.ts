import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { assertEmailVerificationSendAllowed, EmailVerificationRateLimitError, enforceEmailVerificationSendLimit } from "./email-verification-policy";

afterEach(() => vi.unstubAllEnvs());

it("reserves hashed recipient and IP keys in a single atomic operation", async () => {
  const evalScript = vi.fn().mockResolvedValue(1);
  await enforceEmailVerificationSendLimit({ eval: evalScript }, { email: "Owner@example.invalid", remoteIp: "203.0.113.10" }, 1);
  expect(evalScript).toHaveBeenCalledTimes(1);
  const [, count, ...args] = evalScript.mock.calls[0]!;
  expect(count).toBe(3);
  expect(args).toEqual([expect.stringContaining(":cooldown"), expect.stringContaining(":hour:1"), expect.stringContaining(":ip:"), 60, 3660, 3, 10]);
  expect(JSON.stringify(args)).not.toMatch(/Owner|example.invalid|203\.0\.113/);
});

it("keeps password reset quota apart and counts one IPv6 /64 as one client", async () => {
  const evalScript = vi.fn().mockResolvedValue(1);
  const keysFor = async (input: Parameters<typeof enforceEmailVerificationSendLimit>[1]) => {
    await enforceEmailVerificationSendLimit({ eval: evalScript }, input, 1);
    return evalScript.mock.lastCall!.slice(2, 5);
  };
  const reset = await keysFor({ email: "owner@example.invalid", remoteIp: "2001:db8::1", scope: "password-reset" });
  const verification = await keysFor({ email: "owner@example.invalid", remoteIp: "2001:db8::1" });
  expect(reset.every(key => key.includes(":password-reset:"))).toBe(true);
  expect(verification.every(key => key.includes(":email-verification:"))).toBe(true);
  const sameSubnet = await keysFor({ email: "owner@example.invalid", remoteIp: "2001:db8::abcd:2", scope: "password-reset" });
  const otherSubnet = await keysFor({ email: "owner@example.invalid", remoteIp: "2001:db8:0:1::1", scope: "password-reset" });
  expect(sameSubnet[2]).toBe(reset[2]);
  expect(otherSubnet[2]).not.toBe(reset[2]);
});

it("fails closed on rejection, store failure, or missing production Redis", async () => {
  await expect(enforceEmailVerificationSendLimit({ eval: async () => 0 }, { email: "a@example.invalid" })).rejects.toBeInstanceOf(EmailVerificationRateLimitError);
  await expect(enforceEmailVerificationSendLimit({ eval: async () => { throw new Error("offline"); } }, { email: "a@example.invalid" })).rejects.toThrow("offline");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("REDIS_URL", "");
  await expect(assertEmailVerificationSendAllowed({ email: "a@example.invalid" })).rejects.toThrow("unavailable");
});

describe.skipIf(!process.env.REDIS_TEST_URL)("verification reservation against Redis", () => {
  it("admits one concurrent issuance, enforces hourly quotas, and expires counters", async () => {
    const redis = new Redis(process.env.REDIS_TEST_URL!);
    const prefix = `verification-test:${randomUUID()}`;
    vi.stubEnv("REDIS_PREFIX", prefix);
    try {
      const results = await Promise.allSettled(Array.from({ length: 20 }, () => enforceEmailVerificationSendLimit(redis, { email: "owner@example.invalid" }, 1)));
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      for (let n = 0; n < 2; n++) {
        const keys = await redis.keys(`${prefix}:*:cooldown`);
        await redis.del(...keys);
        await enforceEmailVerificationSendLimit(redis, { email: "OWNER@example.invalid" }, 1);
      }
      await redis.del(...await redis.keys(`${prefix}:*:cooldown`));
      await expect(enforceEmailVerificationSendLimit(redis, { email: "owner@example.invalid" }, 1)).rejects.toBeInstanceOf(EmailVerificationRateLimitError);
      for (let n = 0; n < 10; n++) await enforceEmailVerificationSendLimit(redis, { email: `${n}@example.invalid`, remoteIp: "203.0.113.10" }, 1);
      await expect(enforceEmailVerificationSendLimit(redis, { email: "blocked@example.invalid", remoteIp: "203.0.113.10" }, 1)).rejects.toBeInstanceOf(EmailVerificationRateLimitError);
      for (const key of await redis.keys(`${prefix}:*:hour:1`)) expect(await redis.ttl(key)).toBeGreaterThan(0);
      const reset = { email: "owner@example.invalid", scope: "password-reset" } as const;
      for (let n = 0; n < 3; n++) {
        await enforceEmailVerificationSendLimit(redis, reset, 1);
        await redis.del(...await redis.keys(`${prefix}:password-reset:*:cooldown`));
      }
      await expect(enforceEmailVerificationSendLimit(redis, reset, 1)).rejects.toBeInstanceOf(EmailVerificationRateLimitError);
    } finally {
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
  });
});
