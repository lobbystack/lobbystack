import { afterEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ eval: vi.fn() }));
const readyRedis = vi.hoisted(() => vi.fn());
vi.mock("./redis", () => ({ readyRedis }));

import { buildCalendarOAuthRateLimits, enforceCalendarOAuthRateLimits } from "./google-calendar-oauth-limit";

afterEach(() => {
  vi.unstubAllEnvs();
  readyRedis.mockReset();
});

describe("Google Calendar OAuth rate limits", () => {
  it("bounds the authenticated start flow by operator, business, and trusted IP", () => {
    const limits = buildCalendarOAuthRateLimits({ operation: "start", userId: "operator-9f3", businessId: "tenant-7c2", ip: "203.0.113.10" });
    expect(limits.map((entry) => [entry.name, entry.limit, entry.windowSeconds])).toEqual([
      ["ip-hour", 30, 3600],
      ["user-hour", 20, 3600],
      ["business-hour", 60, 3600],
    ]);
    const keys = limits.map((entry) => entry.key).join(" ");
    expect(keys).not.toContain("operator-9f3");
    expect(keys).not.toContain("tenant-7c2");
    expect(keys).not.toContain("203.0.113.10");
  });

  it("keeps the start flow bounded by identity when no trusted IP is configured", () => {
    const names = buildCalendarOAuthRateLimits({ operation: "start", userId: "user", businessId: "business" }).map((entry) => entry.name);
    expect(names).toEqual(["user-hour", "business-hour"]);
  });

  it("always bounds the unauthenticated callback by IP, falling back to one shared bucket", () => {
    const withIp = buildCalendarOAuthRateLimits({ operation: "callback", ip: "203.0.113.10" });
    expect(withIp.map((entry) => [entry.name, entry.limit])).toEqual([["ip-hour", 120]]);
    const ipKey = (ip: string) => buildCalendarOAuthRateLimits({ operation: "callback", ip })[0]!.key;
    expect(ipKey("2001:db8::1")).toBe(ipKey("2001:db8::abcd:2"));
    expect(ipKey("2001:db8::1")).not.toBe(ipKey("2001:db8:0:1::1"));
    const unattributed = buildCalendarOAuthRateLimits({ operation: "callback" });
    expect(unattributed.map((entry) => [entry.name, entry.limit])).toEqual([["ip-unattributed-hour", 600]]);
  });

  it("counts the authenticated callback dimensions separately from the entry check", () => {
    const names = buildCalendarOAuthRateLimits({ operation: "callback", userId: "user", businessId: "business" }).map((entry) => entry.name);
    expect(names).toEqual(["user-hour", "business-hour"]);
  });

  it("reports the blocked dimension without exposing its key", async () => {
    readyRedis.mockResolvedValue(redis);
    redis.eval.mockResolvedValueOnce(2);
    await expect(enforceCalendarOAuthRateLimits(
      { operation: "start", userId: "user", businessId: "business", ip: "203.0.113.10" },
    )).resolves.toEqual({ allowed: false, status: 429, code: "calendar_oauth_rate_limited", reason: "rate_limit_user_hour" });
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 3, expect.any(String), expect.any(String), expect.any(String), "30", "3601", "20", "3601", "60", "3601");
  });

  it("fails closed in production when the store is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("REDIS_URL", "redis://redis.test:6379");
    readyRedis.mockRejectedValue(new Error("offline"));
    await expect(enforceCalendarOAuthRateLimits({ operation: "callback" })).resolves.toEqual({
      allowed: false,
      status: 503,
      code: "calendar_oauth_rate_limit_unavailable",
      reason: "rate_limit_unavailable",
    });
  });

  it("fails closed in production when Redis is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    readyRedis.mockResolvedValue(undefined);
    await expect(enforceCalendarOAuthRateLimits({ operation: "start", userId: "user", businessId: "business" })).resolves.toEqual({
      allowed: false,
      status: 503,
      code: "calendar_oauth_rate_limit_unavailable",
      reason: "rate_limit_unavailable",
    });
  });

  it("allows the flow in development when Redis is not configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REDIS_URL", "");
    readyRedis.mockResolvedValue(undefined);
    await expect(enforceCalendarOAuthRateLimits({ operation: "callback" })).resolves.toEqual({ allowed: true });
  });
});
