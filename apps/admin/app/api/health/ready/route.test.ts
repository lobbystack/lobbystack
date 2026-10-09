import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redis: vi.fn() }));
vi.mock("@lobbystack/db", () => ({ databaseHealthCheck: async () => ({ ok: true }) }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({}) }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => ({ ensureReady: async () => undefined }) }));
vi.mock("@/lib/redis", () => ({ readyRedis: mocks.redis }));
import { GET } from "./route";

describe("admin readiness", () => {
  beforeEach(() => {
    mocks.redis.mockReset();
  });

  it("fails when the configured Redis is unreachable", async () => {
    mocks.redis.mockRejectedValue(new Error("Redis readiness timed out."));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, checks: { database: "ok", storage: "ok", redis: "failed" } });
  });

  it("passes when Redis answers a ping or REDIS_URL is unset outside production", async () => {
    mocks.redis.mockResolvedValueOnce({ ping: async () => "PONG" }).mockResolvedValueOnce(undefined);
    expect((await GET()).status).toBe(200);
    expect((await GET()).status).toBe(200);
  });

  it("fails in production when REDIS_URL is unset, since every rate limit would return 503", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.redis.mockResolvedValue(undefined);
    const response = await GET();
    vi.unstubAllEnvs();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ checks: { redis: "failed" } });
  });
});
