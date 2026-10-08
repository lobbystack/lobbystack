import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachWorkerToLiveSession, endLiveBrowserSession } from "./live-prototype";

const fetchMock = vi.fn();
const attachInput = { sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "voice" as const };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
  vi.stubEnv("WORKER_INTERNAL_URL", "http://worker.test");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("attachWorkerToLiveSession", () => {
  const draining = () => new Response(JSON.stringify({ error: "This worker is shutting down." }), { status: 503 });

  it("waits 250 ms, then 750 ms, before retrying a draining worker's 503, within one timeout", async () => {
    const refusals = [draining(), draining()];
    const sentAt: number[] = [];
    fetchMock.mockImplementation(async () => {
      sentAt.push(performance.now());
      return refusals[sentAt.length - 1] ?? new Response(null, { status: 200 });
    });
    await attachWorkerToLiveSession(attachInput);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(245);
    expect(sentAt[1]! - sentAt[0]!).toBeLessThan(700);
    expect(sentAt[2]! - sentAt[1]!).toBeGreaterThanOrEqual(745);
    expect(fetchMock.mock.calls.every(([url]) => url === "http://worker.test/internal/live/attach")).toBe(true);
    // Every attempt shares the first attempt's abort signal.
    expect(new Set(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).signal)).size).toBe(1);
    // The refusals' bodies were cancelled, not left holding their connections.
    expect(refusals.every((refusal) => refusal.bodyUsed)).toBe(true);
  });

  it("gives up after two retries", async () => {
    fetchMock.mockImplementation(async () => draining());
    await expect(attachWorkerToLiveSession(attachInput)).rejects.toThrow("Worker attach failed with status 503.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops waiting to retry when the shared 10-second budget runs out", async () => {
    // Stands in for the 10-second timeout, which here runs out 50 ms after the first refusal.
    const budget = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(budget.signal);
    fetchMock.mockImplementationOnce(async () => {
      setTimeout(() => budget.abort(new DOMException("The operation timed out.", "TimeoutError")), 50);
      return draining();
    });
    const startedAt = performance.now();
    await expect(attachWorkerToLiveSession(attachInput)).rejects.toThrow();
    expect(performance.now() - startedAt).toBeLessThan(240);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry other failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(attachWorkerToLiveSession(attachInput)).rejects.toThrow("Worker attach failed with status 500.");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(attachWorkerToLiveSession(attachInput)).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("endLiveBrowserSession", () => {
  it("doesn't retry a 503", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(endLiveBrowserSession("live_1")).rejects.toThrow("Worker end failed with status 503.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
