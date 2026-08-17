import { afterEach, describe, expect, it, vi } from "vitest";

import type { DomainContext } from "@lobbystack/domain";
import { demoSnapshot } from "@lobbystack/shared";

import { createWidgetSnapshotCache, widgetSnapshotCache } from "./widget-snapshot-cache";

const context = { db: {} } as unknown as DomainContext;
const businessId = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  widgetSnapshotCache.clear();
});

describe("widgetSnapshotCache", () => {
  it("fetches the snapshot on first read and serves the cached copy afterwards", async () => {
    const load = vi.fn(async () => ({ ...demoSnapshot, displayName: "Clinic" }));
    const cache = createWidgetSnapshotCache({ load });

    const first = await cache.get(context, { businessId });
    const second = await cache.get(context, { businessId });

    expect(first?.displayName).toBe("Clinic");
    expect(second?.displayName).toBe("Clinic");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("avoids per-turn backend reads by keying on the business", async () => {
    const load = vi.fn(async () => ({ ...demoSnapshot }));
    const cache = createWidgetSnapshotCache({ load });

    await cache.get(context, { businessId });
    await cache.get(context, { businessId });
    await cache.get(context, { businessId });

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the cached snapshot has expired", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn(async () => demoSnapshot);
      const cache = createWidgetSnapshotCache({ ttlMs: 10, load });

      await cache.get(context, { businessId });
      await cache.get(context, { businessId });
      expect(load).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(20);
      await cache.get(context, { businessId });
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retain a null snapshot across turns", async () => {
    const load = vi.fn(async (): Promise<null> => null);
    const cache = createWidgetSnapshotCache({ load });

    await cache.get(context, { businessId });
    await cache.get(context, { businessId });

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not share state between separately created caches", async () => {
    const load = vi.fn(async () => demoSnapshot);
    const cacheA = createWidgetSnapshotCache({ load });
    const cacheB = createWidgetSnapshotCache({ load });

    await cacheA.get(context, { businessId });
    await cacheB.get(context, { businessId });

    expect(load).toHaveBeenCalledTimes(2);
  });
});
