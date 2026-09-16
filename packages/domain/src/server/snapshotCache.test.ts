import { beforeEach, describe, expect, it, vi } from "vitest";

import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { createInMemorySnapshotCache, deserializeSnapshot, getCachedBusinessSnapshot, serializeSnapshot, snapshotCacheKey, SNAPSHOT_CACHE_TTL_SECONDS } from "./snapshotCache";

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

function makeContext(snapshotCache: DomainContext["snapshotCache"] | null): DomainContext {
  return snapshotCache ? { db: {} as never, snapshotCache } : { db: {} as never };
}

describe("snapshot cache contract", () => {
  it("keys by business under a stable shared prefix", () => {
    expect(snapshotCacheKey(businessId)).toBe(`lobbystack:widget:snapshot:${businessId}`);
  });

  it("serializes and deserializes a snapshot through zod", () => {
    const snapshot = {
      ...demoSnapshot,
      businessId,
      services: demoSnapshot.services.map((service, index) => ({ ...service, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` })),
    };
    const raw = serializeSnapshot(snapshot);
    const parsed = deserializeSnapshot(raw);
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

describe("getCachedBusinessSnapshot", () => {
  it("serves a cache hit without reading the database", async () => {
    const cache = createInMemorySnapshotCache();
    await cache.set(businessId, { ...demoSnapshot, displayName: "Clinic" });
    const result = await getCachedBusinessSnapshot(makeContext(cache), { businessId });
    expect(result?.displayName).toBe("Clinic");
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("loads and backfills the cache on a miss", async () => {
    const cache = createInMemorySnapshotCache();
    const result = await getCachedBusinessSnapshot(makeContext(cache), { businessId });
    expect(result?.displayName).toBe("Loaded");
    expect(loadMock).toHaveBeenCalledTimes(1);
    await expect(cache.get(businessId)).resolves.toEqual(expect.objectContaining({ displayName: "Loaded" }));
  });

  it("does not cache a null snapshot across turns", async () => {
    loadMock.mockResolvedValue(null as BusinessContextSnapshot | null);
    const cache = createInMemorySnapshotCache();
    await getCachedBusinessSnapshot(makeContext(cache), { businessId });
    await getCachedBusinessSnapshot(makeContext(cache), { businessId });
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it("re-fetches once the cached snapshot has expired", async () => {
    vi.useFakeTimers();
    try {
      const cache = createInMemorySnapshotCache({ ttlMs: 10 });
      await getCachedBusinessSnapshot(makeContext(cache), { businessId });
      vi.advanceTimersByTime(20);
      await getCachedBusinessSnapshot(makeContext(cache), { businessId });
      expect(loadMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to a direct read when no cache is configured", async () => {
    const result = await getCachedBusinessSnapshot(makeContext(null), { businessId });
    expect(result?.displayName).toBe("Loaded");
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});
