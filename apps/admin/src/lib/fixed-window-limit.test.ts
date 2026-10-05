import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redis: { eval: vi.fn() } as { eval: ReturnType<typeof vi.fn> } | undefined }));
vi.mock("./redis", () => ({ readyRedis: async () => mocks.redis, closeRedis: vi.fn() }));

import { enforceFixedWindow, type FixedWindowLimit } from "./fixed-window-limit";

const limits: FixedWindowLimit[] = [
  { name: "minute", key: "k:minute", limit: 2, windowSeconds: 60, reason: "rate_limit_minute" },
  { name: "day", key: "k:day", limit: 5, windowSeconds: 86_400, reason: "rate_limit_day" },
];

// Mirrors the Lua script: check every counter, then INCR all and EXPIRE on the first increment.
function memoryEval(store: Map<string, number>, ttls: Map<string, number>) {
  return async (_script: string, numKeys: number, ...rest: string[]) => {
    const keys = rest.slice(0, numKeys);
    const argv = rest.slice(numKeys);
    for (const [index, key] of keys.entries()) {
      if ((store.get(key) ?? 0) >= Number(argv[index * 2])) return index + 1;
    }
    for (const [index, key] of keys.entries()) {
      const count = (store.get(key) ?? 0) + 1;
      store.set(key, count);
      if (count === 1) ttls.set(key, Number(argv[index * 2 + 1]));
    }
    return 0;
  };
}

beforeEach(() => {
  mocks.redis = { eval: vi.fn() };
});
afterEach(() => vi.unstubAllEnvs());

describe("enforceFixedWindow", () => {
  it("passes keys in order and a [limit, windowSeconds + 1] ARGV pair per key", async () => {
    mocks.redis!.eval.mockResolvedValueOnce(0);
    await expect(enforceFixedWindow(limits)).resolves.toEqual({ allowed: true });
    expect(mocks.redis!.eval).toHaveBeenCalledWith(expect.any(String), 2, "k:minute", "k:day", "2", "61", "5", "86401");
  });

  it("maps the blocked index to that limit's reason", async () => {
    mocks.redis!.eval.mockResolvedValueOnce(2);
    await expect(enforceFixedWindow(limits)).resolves.toEqual({ allowed: false, status: 429, reason: "rate_limit_day" });
  });

  it("counts against every key, sets the TTL once, and charges nothing for a rejected request", async () => {
    const store = new Map<string, number>();
    const ttls = new Map<string, number>();
    mocks.redis!.eval.mockImplementation(memoryEval(store, ttls));
    await enforceFixedWindow(limits);
    await enforceFixedWindow(limits);
    await expect(enforceFixedWindow(limits)).resolves.toEqual({ allowed: false, status: 429, reason: "rate_limit_minute" });
    expect(Object.fromEntries(store)).toEqual({ "k:minute": 2, "k:day": 2 });
    expect(Object.fromEntries(ttls)).toEqual({ "k:minute": 61, "k:day": 86_401 });
  });

  it("rejects with 503 in production when REDIS_URL is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "");
    mocks.redis = undefined;
    await expect(enforceFixedWindow(limits)).resolves.toEqual({ allowed: false, status: 503, reason: "rate_limit_unavailable" });
  });

  it("allows requests in development when REDIS_URL is unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REDIS_URL", "");
    mocks.redis = undefined;
    await expect(enforceFixedWindow(limits)).resolves.toEqual({ allowed: true });
  });
});
