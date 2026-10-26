import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(async (_channel: string, _message: string) => 1),
  ready: vi.fn(),
  subscribers: [] as Array<{ url: string; options: Record<string, unknown>; emitter: import("node:events").EventEmitter; subscribe: ReturnType<typeof vi.fn> }>,
  report: vi.fn(),
}));
vi.mock("./redis", () => ({ readyRedis: mocks.ready }));
vi.mock("./error-reporting", () => ({ reportServerError: mocks.report }));
vi.mock("ioredis", () => ({
  default: class {
    readonly status = "wait";
    private readonly entry;
    constructor(url: string, options: Record<string, unknown>) {
      this.entry = { url, options, emitter: new EventEmitter(), subscribe: vi.fn(async (_channel: string) => 1) };
      mocks.subscribers.push(this.entry);
    }
    on(event: string, listener: (...args: unknown[]) => void) { this.entry.emitter.on(event, listener); return this; }
    subscribe(channel: string) { return this.entry.subscribe(channel); }
    disconnect() {}
  },
}));
vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return { ...actual, listenForBrandChanges: vi.fn(actual.listenForBrandChanges) };
});

const { listenForBrandChanges } = await import("@lobbystack/domain");
const { listenForBrandChangesOnce, redisBrandChanges } = await import("./brand-changes");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("brand changes over Redis", () => {
  it("announces a change on the deployment's channel, and does nothing without Redis", async () => {
    vi.stubEnv("REDIS_PREFIX", "acme");
    mocks.ready.mockResolvedValueOnce({ publish: mocks.publish });
    await redisBrandChanges.publish({ kind: "partner", partnerId: "partner-1" });
    expect(mocks.publish).toHaveBeenCalledWith("acme:brand-changes", JSON.stringify({ kind: "partner", partnerId: "partner-1" }));
    mocks.ready.mockResolvedValueOnce(undefined);
    await expect(redisBrandChanges.publish({ kind: "host" })).resolves.toBeUndefined();
  });

  // brands.integration.test.ts covers what each message clears.
  it("listens once per process copy of the cache, on a connection of its own", async () => {
    listenForBrandChangesOnce();
    expect(mocks.subscribers).toEqual([]);
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    listenForBrandChangesOnce();
    listenForBrandChangesOnce();
    expect(mocks.subscribers).toHaveLength(1);
    const [subscriber] = mocks.subscribers;
    // Subscribing waits for Redis rather than failing while it's down.
    expect(subscriber!.options).toMatchObject({ lazyConnect: true, maxRetriesPerRequest: null });
    expect(listenForBrandChanges).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(subscriber!.subscribe).toHaveBeenCalledWith("lobbystack:brand-changes"));
    expect(subscriber!.emitter.listenerCount("message")).toBe(1);
  });

  it("tries again on the next brand lookup when it couldn't subscribe, and reports why", async () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    const failure = new Error("subscribe refused");
    mocks.subscribers.length = 0;
    // The earlier test's listener still runs in this module, so start from a fresh copy.
    vi.resetModules();
    const fresh = await import("./brand-changes");
    const { listenForBrandChanges: listen } = await import("@lobbystack/domain");
    vi.mocked(listen).mockRejectedValueOnce(failure);
    fresh.listenForBrandChangesOnce();
    await vi.waitFor(() => expect(mocks.report).toHaveBeenCalledWith(failure, { operation: "listen_for_brand_changes" }));
    fresh.listenForBrandChangesOnce();
    expect(mocks.subscribers).toHaveLength(2);
  });
});
