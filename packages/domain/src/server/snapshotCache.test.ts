import { beforeEach, describe, expect, it, vi } from "vitest";

import { demoSnapshot, runtimeLocales, type BusinessContextSnapshot, type SnapshotAgent } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { deserializeSnapshot, getBusinessSnapshotForAgent, getCachedBusinessSnapshot, redisSnapshotCache, snapshotCacheKey, SNAPSHOT_CACHE_TTL_SECONDS, type SnapshotCacheClient } from "./snapshotCache";

vi.mock("./knowledge", () => ({
  loadLatestBusinessSnapshot: vi.fn(),
  loadSnapshotAgent: vi.fn(),
  refreshBusinessSnapshot: vi.fn(),
}));

import { loadLatestBusinessSnapshot, loadSnapshotAgent, refreshBusinessSnapshot } from "./knowledge";

const businessId = "00000000-0000-4000-8000-000000000001";

const loadMock = vi.mocked(loadLatestBusinessSnapshot);
const refreshMock = vi.mocked(refreshBusinessSnapshot);
const agentRowMock = vi.mocked(loadSnapshotAgent);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REDIS_PREFIX", "lobbystack");
  loadMock.mockResolvedValue({ ...demoSnapshot, displayName: "Loaded" });
  refreshMock.mockResolvedValue("version");
});

const agent = (id: string, greeting: string): SnapshotAgent => ({
  id,
  name: `Agent ${id}`,
  isDefault: id === "default",
  greeting,
  tone: "warm",
  voice: "marin",
  voiceInstructions: "Voice",
  smsInstructions: "Text",
  chatInstructions: "Chat",
  bookingPolicy: "Book",
  bookingMode: "instant",
  transferPolicy: { mode: "never" },
  rules: [],
});

describe("getBusinessSnapshotForAgent", () => {
  const withAgents = { ...validSnapshotForAgents(), agents: [agent("default", "Default"), agent("after-hours", "After hours")] };

  function validSnapshotForAgents(): BusinessContextSnapshot {
    return { ...demoSnapshot, greeting: "Default" };
  }

  function cacheHolding(snapshot: BusinessContextSnapshot): SnapshotCacheClient {
    return { get: async () => snapshot, set: async () => undefined };
  }

  it("answers from the loaded snapshot with no refresh when it lists the agent", async () => {
    const snapshot = await getBusinessSnapshotForAgent(makeContext(cacheHolding(withAgents)), { businessId, agentId: "after-hours" });
    expect(snapshot).toMatchObject({ agentId: "after-hours", greeting: "After hours" });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("returns the flat fields with no refresh when no agent is named", async () => {
    const old = validSnapshotForAgents();
    expect(await getBusinessSnapshotForAgent(makeContext(cacheHolding(old)), { businessId })).toBe(old);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes once and retries against the stored snapshot when the agent is missing", async () => {
    // The cache still holds the stale copy, as when its write-through fails.
    const stale = { ...withAgents, agents: [agent("default", "Default")] };
    loadMock.mockResolvedValue(withAgents);
    const snapshot = await getBusinessSnapshotForAgent(makeContext(cacheHolding(stale)), { businessId, agentId: "after-hours" });
    expect(snapshot).toMatchObject({ agentId: "after-hours", greeting: "After hours" });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes an old snapshot with no agents before it trusts an agent id", async () => {
    loadMock.mockResolvedValue(withAgents);
    const snapshot = await getBusinessSnapshotForAgent(makeContext(cacheHolding(validSnapshotForAgents())), { businessId, agentId: "after-hours" });
    expect(snapshot).toMatchObject({ agentId: "after-hours" });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("logs an error and answers as the default agent when a refresh doesn't find the agent", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadMock.mockResolvedValue(withAgents);
    const snapshot = await getBusinessSnapshotForAgent(makeContext(cacheHolding(withAgents)), { businessId, agentId: "gone" });
    expect(snapshot).toBe(withAgents);
    expect(snapshot?.greeting).toBe("Default");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[snapshot] unknown agent, answering as the default agent", businessId, "gone");
    error.mockRestore();
  });

  it("still answers as the default agent when the refresh fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    refreshMock.mockRejectedValue(new Error("database down"));
    const snapshot = await getBusinessSnapshotForAgent(makeContext(cacheHolding(withAgents)), { businessId, agentId: "gone" });
    expect(snapshot?.greeting).toBe("Default");
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("builds the first snapshot of a business that has none", async () => {
    loadMock.mockResolvedValueOnce(null).mockResolvedValueOnce(withAgents);
    expect(await getBusinessSnapshotForAgent(makeContext(null), { businessId, agentId: "after-hours" })).toMatchObject({ agentId: "after-hours" });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("fails like today's loader when a business with no snapshot can't build one", async () => {
    loadMock.mockResolvedValue(null);
    refreshMock.mockRejectedValue(new Error("database down"));
    await expect(getBusinessSnapshotForAgent(makeContext(null), { businessId })).rejects.toThrow("database down");
  });

  it("passes agents through the cached JSON, and reads an old entry without them", () => {
    const parsed = deserializeSnapshot(JSON.stringify({ ...validSnapshot, agents: withAgents.agents }));
    expect(parsed?.agents).toEqual(withAgents.agents);
    const old = deserializeSnapshot(JSON.stringify(validSnapshot));
    expect(old).not.toBeNull();
    expect(old).not.toHaveProperty("agents");
  });
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

  it("keeps a snapshot in any caller language, so calls don't miss the cache", () => {
    for (const defaultLocale of runtimeLocales) {
      expect(deserializeSnapshot(JSON.stringify({ ...validSnapshot, defaultLocale }))?.defaultLocale).toBe(defaultLocale);
    }
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

describe("getBusinessSnapshotForAgent for a call already started", () => {
  const stored = { ...demoSnapshot, greeting: "Hello", agents: [agent("default", "Hello")] };
  const context = { db: {} } as unknown as DomainContext;

  it("projects a snapshot it was handed without reading anything", async () => {
    const snapshot = await getBusinessSnapshotForAgent(context, { businessId, agentId: "default", loaded: stored });
    expect(snapshot).toMatchObject({ agentId: "default" });
    expect(loadMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("finishes a call as an agent archived since it started", async () => {
    loadMock.mockResolvedValue(stored);
    agentRowMock.mockResolvedValue(agent("archived", "Good evening"));
    const snapshot = await getBusinessSnapshotForAgent(context, { businessId, agentId: "archived", underWay: true });
    expect(snapshot).toMatchObject({ agentId: "archived", greeting: "Good evening" });
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("answers as the default agent when an agent that started no call is gone", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadMock.mockResolvedValue(stored);
    const snapshot = await getBusinessSnapshotForAgent(context, { businessId, agentId: "archived" });
    expect(snapshot).toMatchObject({ greeting: "Hello" });
    expect(agentRowMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[snapshot] unknown agent, answering as the default agent", businessId, "archived");
    error.mockRestore();
  });

  it("answers as the default agent when even the agent's row can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadMock.mockResolvedValue(stored);
    agentRowMock.mockRejectedValue(new Error("database down"));
    const snapshot = await getBusinessSnapshotForAgent(context, { businessId, agentId: "archived", underWay: true });
    expect(snapshot).toMatchObject({ greeting: "Hello" });
    error.mockRestore();
  });
});
