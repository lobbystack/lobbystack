import { afterEach, describe, expect, it, vi } from "vitest";

import { createInMemorySnapshotCache, deserializeSnapshot, serializeSnapshot, snapshotCacheKey, type SnapshotCacheClient } from "@lobbystack/domain";
import { demoSnapshot } from "@lobbystack/shared";

import { closeAdminSnapshotCache, getAdminSnapshotCache } from "./widget-snapshot-cache";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin widget snapshot cache (Redis-backed)", () => {
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
    const raw = serializeSnapshot(snapshot);
    const parsed = deserializeSnapshot(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.businessId).toBe("00000000-0000-4000-8000-000000000001");
    expect(deserializeSnapshot("not json")).toBeNull();
    expect(deserializeSnapshot(null)).toBeNull();
  });

  it("round-trips a real snapshot through the in-memory cache used as a double", async () => {
    const cache = createInMemorySnapshotCache() as SnapshotCacheClient;
    await cache.set("00000000-0000-4000-8000-000000000002", demoSnapshot);
    await expect(cache.get("00000000-0000-4000-8000-000000000002")).resolves.toEqual(demoSnapshot);
  });

  it("does not leak a stale connection handle across tests", async () => {
    await closeAdminSnapshotCache();
    const cache = getAdminSnapshotCache();
    await expect(cache.get("00000000-0000-4000-8000-000000000003")).resolves.toBeNull();
  });
});
