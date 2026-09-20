import { describe, expect, it } from "vitest";
import type { BusinessContextSnapshot } from "@lobbystack/shared";
import { createSnapshotCache } from "./snapshotCache";

const snapshot = (businessId: string) => ({ businessId }) as BusinessContextSnapshot;
describe("voice snapshot cache", () => {
  it("expires entries without invalidating the snapshot already held by an active call", () => {
    let time = 0;
    const cache = createSnapshotCache({ ttlMs: 10, now: () => time });
    const original = snapshot("a");
    cache.set("a", original);
    const activeCall = cache.get("a");
    time = 9;
    expect(cache.get("a")).toBe(original);
    time = 10;
    expect(cache.get("a")).toBeNull();
    expect(activeCall).toBe(original);
    const updated = snapshot("a");
    cache.set("a", updated);
    expect(cache.get("a")).toBe(updated);
    expect(activeCall).toBe(original);
  });
  it("evicts least recently used tenants at capacity", () => {
    const cache = createSnapshotCache({ maxEntries: 2 });
    cache.set("a", snapshot("a")); cache.set("b", snapshot("b"));
    cache.get("a"); cache.set("c", snapshot("c"));
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")?.businessId).toBe("a");
    expect(cache.get("c")?.businessId).toBe("c");
  });
  it("sweeps expired entries before enforcing capacity", () => {
    let time = 0;
    const evictions: Array<{ businessId: string; reason: "expired" | "capacity" }> = [];
    const cache = createSnapshotCache({ ttlMs: 10, maxEntries: 2, now: () => time, onEvict: event => evictions.push(event) });
    cache.set("expired", snapshot("expired"));
    time = 5;
    cache.set("live", snapshot("live"));
    cache.get("expired");
    time = 10;
    cache.set("new", snapshot("new"));

    expect(cache.get("expired")).toBeNull();
    expect(cache.get("live")?.businessId).toBe("live");
    expect(cache.get("new")?.businessId).toBe("new");
    expect(evictions).toEqual([{ businessId: "expired", reason: "expired" }]);
  });
  it("reports expiration and capacity eviction reasons", () => {
    let time = 0;
    const evictions: Array<{ businessId: string; reason: "expired" | "capacity" }> = [];
    const cache = createSnapshotCache({ ttlMs: 10, maxEntries: 1, now: () => time, onEvict: event => evictions.push(event) });
    cache.set("a", snapshot("a"));
    cache.set("b", snapshot("b"));
    time = 10;
    expect(cache.get("b")).toBeNull();
    expect(evictions).toEqual([
      { businessId: "a", reason: "capacity" },
      { businessId: "b", reason: "expired" },
    ]);
  });
  it("rejects invalid limits", () => {
    expect(() => createSnapshotCache({ maxEntries: 0 })).toThrow();
    expect(() => createSnapshotCache({ ttlMs: NaN })).toThrow();
  });
});
