import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EmailVerificationRateLimitError, enforceEmailVerificationSendLimit } from "./email-verification-policy";

function store(options: { reserve?: () => "OK" | null } = {}) {
  const counts = new Map<string, number>();
  return {
    set: vi.fn(async (_key: string, _value: string, _expiryMode: "EX", _ttl: number, _setMode: "NX") => options.reserve ? options.reserve() : "OK" as const),
    incr: vi.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };
}

describe("email verification send limits", () => {
  it("enforces a recipient cooldown without putting the email in Redis keys", async () => {
    let available = true;
    const redis = store({ reserve: () => {
      if (!available) return null;
      available = false;
      return "OK";
    } });

    await enforceEmailVerificationSendLimit(redis, { email: "Owner@Example.invalid" }, 1);
    await expect(enforceEmailVerificationSendLimit(redis, { email: "owner@example.invalid" }, 1)).rejects.toBeInstanceOf(EmailVerificationRateLimitError);
    expect(redis.set.mock.calls[0]?.[0]).not.toContain("owner@example.invalid");
  });

  it("limits each recipient to three accepted resend requests per hour", async () => {
    const redis = store();
    for (let request = 0; request < 3; request += 1) {
      await enforceEmailVerificationSendLimit(redis, { email: "owner@example.invalid" }, 2);
    }
    await expect(enforceEmailVerificationSendLimit(redis, { email: "owner@example.invalid" }, 2)).rejects.toBeInstanceOf(EmailVerificationRateLimitError);
    expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining(":hour:2"), 3_660);
  });

  it("limits aggregate resend requests from one IP without storing the IP", async () => {
    const redis = store();
    for (let request = 0; request < 10; request += 1) {
      await enforceEmailVerificationSendLimit(redis, { email: `owner-${request}@example.invalid`, remoteIp: "203.0.113.10" }, 3);
    }
    await expect(enforceEmailVerificationSendLimit(redis, { email: "final@example.invalid", remoteIp: "203.0.113.10" }, 3)).rejects.toBeInstanceOf(EmailVerificationRateLimitError);
    expect(redis.incr.mock.calls.flat().join(" ")).not.toContain("203.0.113.10");
  });
});
