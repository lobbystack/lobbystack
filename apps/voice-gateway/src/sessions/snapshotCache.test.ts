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
  it("rejects invalid limits", () => {
    expect(() => createSnapshotCache({ maxEntries: 0 })).toThrow();
    expect(() => createSnapshotCache({ ttlMs: NaN })).toThrow();
  });
});
