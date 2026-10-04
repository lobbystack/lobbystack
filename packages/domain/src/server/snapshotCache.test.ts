import { beforeEach, describe, expect, it, vi } from "vitest";

import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { deserializeSnapshot, getCachedBusinessSnapshot, redisSnapshotCache, snapshotCacheKey, SNAPSHOT_CACHE_TTL_SECONDS, type SnapshotCacheClient } from "./snapshotCache";

vi.mock("./knowledge", () => ({
  loadLatestBusinessSnapshot: vi.fn(),
}));

import { loadLatestBusinessSnapshot } from "./knowledge";

const businessId = "00000000-0000-4000-8000-000000000001";

const loadMock = vi.mocked(loadLatestBusinessSnapshot);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REDIS_PREFIX", "lobbystack");
  loadMock.mockResolvedValue({ ...demoSnapshot, displayName: "Loaded" });
});

function memoryCache(): SnapshotCacheClient {
  const store = new Map<string, BusinessContextSnapshot>();
  return { get: async (id) => store.get(id) ?? null, set: async (id, snapshot) => { store.set(id, snapshot); } };
}

const validSnapshot = {
  ...demoSnapshot,
  businessId,
  services: demoSnapshot.services.map((service, index) => ({ ...service, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` })),
};

function makeContext(snapshotCache: DomainContext["snapshotCache"] | null): DomainContext {
  return snapshotCache ? { db: {} as never, snapshotCache } : { db: {} as never };
}

describe("snapshot cache contract", () => {
  it("keys by business under a stable shared prefix", () => {
    expect(snapshotCacheKey(businessId)).toBe(`lobbystack:widget:snapshot:${businessId}`);
  });

  it("deserializes a snapshot through zod", () => {
    const parsed = deserializeSnapshot(JSON.stringify(validSnapshot));
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      businessId,
      displayName: demoSnapshot.displayName,
      chatInstructions: demoSnapshot.chatInstructions,
      hours: demoSnapshot.hours,
    });
    expect(deserializeSnapshot("garbage")).toBeNull();
    expect(deserializeSnapshot(null)).toBeNull();
    expect(deserializeSnapshot(undefined)).toBeNull();
  });
});

describe("redisSnapshotCache", () => {
  it("stores JSON under the shared key with the TTL and reads it back", async () => {
    const store = new Map<string, string>();
    const set = vi.fn(async (key: string, value: string) => { store.set(key, value); return "OK"; });
    const cache = redisSnapshotCache(() => ({ get: async (key) => store.get(key) ?? null, set }));
    await cache.set(businessId, validSnapshot);
    expect(set).toHaveBeenCalledWith(snapshotCacheKey(businessId), JSON.stringify(validSnapshot), "EX", SNAPSHOT_CACHE_TTL_SECONDS);
    await expect(cache.get(businessId)).resolves.toMatchObject({ businessId, displayName: demoSnapshot.displayName });
  });

  it("reads a miss and drops the write when Redis is missing or failing", async () => {
    const failing = redisSnapshotCache(() => ({ get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); } }));
    await expect(failing.get(businessId)).resolves.toBeNull();
    await expect(failing.set(businessId, validSnapshot)).resolves.toBeUndefined();
    const missing = redisSnapshotCache(() => undefined);
    await expect(missing.get(businessId)).resolves.toBeNull();
    await expect(missing.set(businessId, validSnapshot)).resolves.toBeUndefined();
  });
});

describe("getCachedBusinessSnapshot", () => {
  it("serves a cache hit without reading the database", async () => {
    const cache = memoryCache();
    await cache.set(businessId, { ...demoSnapshot, displayName: "Clinic" });
    const result = await getCachedBusinessSnapshot(makeContext(cache), { businessId });
    expect(result?.displayName).toBe("Clinic");
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("loads and backfills the cache on a miss", async () => {
    const cache = memoryCache();
    const result = await getCachedBusinessSnapshot(makeContext(cache), { businessId });
    expect(result?.displayName).toBe("Loaded");
    expect(loadMock).toHaveBeenCalledTimes(1);
    await expect(cache.get(businessId)).resolves.toEqual(expect.objectContaining({ displayName: "Loaded" }));
  });

  it("does not cache a null snapshot across turns", async () => {
    loadMock.mockResolvedValue(null as BusinessContextSnapshot | null);
    const cache = memoryCache();
    await getCachedBusinessSnapshot(makeContext(cache), { businessId });
    await getCachedBusinessSnapshot(makeContext(cache), { businessId });
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to a direct read when no cache is configured", async () => {
    const result = await getCachedBusinessSnapshot(makeContext(null), { businessId });
    expect(result?.displayName).toBe("Loaded");
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});
