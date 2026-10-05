import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deserializeSnapshot, snapshotCacheKey } from "@lobbystack/domain";
import { demoSnapshot } from "@lobbystack/shared";

import { closeRedis } from "./redis";
import { getAdminSnapshotCache } from "./widget-snapshot-cache";

beforeEach(() => {
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("REDIS_PREFIX", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin widget snapshot cache (Redis-backed)", () => {
  it("honors an explicitly isolated namespace", () => {
    vi.stubEnv("REDIS_PREFIX", "release-fixture");
    expect(snapshotCacheKey("business")).toBe("release-fixture:widget:snapshot:business");
  });
  it("falls back to a cache miss and no-op write when REDIS_URL is absent (dev)", async () => {
    vi.stubEnv("REDIS_URL", "");
    const cache = getAdminSnapshotCache();
    await expect(cache.get("00000000-0000-4000-8000-000000000001")).resolves.toBeNull();
    await expect(cache.set("00000000-0000-4000-8000-000000000001", demoSnapshot)).resolves.toBeUndefined();
  });

  it("shares the domain key and serialization contract with the worker", () => {
    const key = snapshotCacheKey("00000000-0000-4000-8000-000000000001");
    expect(key).toBe("lobbystack:widget:snapshot:00000000-0000-4000-8000-000000000001");
    const snapshot = {
      ...demoSnapshot,
      businessId: "00000000-0000-4000-8000-000000000001",
      services: demoSnapshot.services.map((service, index) => ({ ...service, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` })),
    };
    const raw = JSON.stringify(snapshot);
    const parsed = deserializeSnapshot(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.businessId).toBe("00000000-0000-4000-8000-000000000001");
    expect(deserializeSnapshot("not json")).toBeNull();
    expect(deserializeSnapshot(null)).toBeNull();
  });

  it("does not leak a stale connection handle across tests", async () => {
    await closeRedis();
    const cache = getAdminSnapshotCache();
    await expect(cache.get("00000000-0000-4000-8000-000000000003")).resolves.toBeNull();
  });
});
