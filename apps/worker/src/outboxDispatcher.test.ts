import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({
  claimOutboxBatch: vi.fn(),
  markOutboxPublished: vi.fn(),
  markOutboxFailed: vi.fn(),
  enqueueJob: vi.fn(),
  histogramRecords: [] as Array<{ name: string; attributes: Record<string, unknown> }>,
  counterAdds: [] as Array<{ name: string; attributes: Record<string, unknown> }>,
}));

vi.mock("@lobbystack/telemetry/node", () => ({
  getMeter: () => ({
    createCounter: (name: string) => ({ add: (_value: number, attributes: Record<string, unknown>) => mocks.counterAdds.push({ name, attributes }) }),
    createHistogram: (name: string) => ({ record: (_value: number, attributes: Record<string, unknown>) => mocks.histogramRecords.push({ name, attributes }) }),
  }),
  redactOtelExceptionText: (value: string) => value,
}));

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/db")>()),
  claimOutboxBatch: mocks.claimOutboxBatch,
  markOutboxPublished: mocks.markOutboxPublished,
  markOutboxFailed: mocks.markOutboxFailed,
}));

vi.mock("@lobbystack/jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/jobs")>()),
  enqueueJob: mocks.enqueueJob,
}));

import { OutboxDispatcher } from "./outboxDispatcher";

describe("OutboxDispatcher", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.histogramRecords.length = 0;
    mocks.counterAdds.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const row = { id: "00000000-0000-4000-8000-000000000001", topic: "notification.dispatch", businessId: null, aggregateType: "notification", aggregateId: null, dedupeKey: "stable-consumer-key", payload: {}, lockedBy: "dispatcher:claim-one", lockedAt: new Date(), createdAt: new Date(), attempts: 1 };

  it("passes the claim fence to completion while preserving the consumer idempotency key", async () => {
    mocks.claimOutboxBatch.mockResolvedValue([row]);
    mocks.markOutboxPublished.mockResolvedValue(true);
    const queues = new Map(["critical", "default", "bulk", "maintenance"].map((name) => [name, {} as never]));
    const db = {} as Database;
    await new OutboxDispatcher(db, queues).dispatchOnce();
    expect(mocks.enqueueJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ idempotencyKey: row.dedupeKey }));
    expect(mocks.markOutboxPublished).toHaveBeenCalledWith(db, row);
    expect(mocks.markOutboxFailed).not.toHaveBeenCalled();
  });

  it("passes the same claim fence on publish failure", async () => {
    mocks.claimOutboxBatch.mockResolvedValue([row]);
    const error = new Error("queue unavailable");
    mocks.enqueueJob.mockRejectedValue(error);
    const queues = new Map(["critical", "default", "bulk", "maintenance"].map((name) => [name, {} as never]));
    const db = {} as Database;
    await new OutboxDispatcher(db, queues).dispatchOnce();
    expect(mocks.markOutboxFailed).toHaveBeenCalledWith(db, row, error, expect.any(Date));
    expect(mocks.markOutboxPublished).not.toHaveBeenCalled();
  });

  it("does not report a fenced claim as published", async () => {
    mocks.claimOutboxBatch.mockResolvedValue([row]);
    mocks.markOutboxPublished.mockResolvedValue(false);
    const queues = new Map(["critical", "default", "bulk", "maintenance"].map((name) => [name, {} as never]));
    await new OutboxDispatcher({} as Database, queues).dispatchOnce();
    expect(mocks.markOutboxPublished).toHaveBeenCalledWith(expect.anything(), row);
    expect(mocks.counterAdds.some((entry) => entry.name === "lobbystack.outbox.published")).toBe(false);
    expect(mocks.histogramRecords).toContainEqual({ name: "lobbystack.outbox.publish_duration_ms", attributes: { topic: "notification.dispatch", outcome: "fenced" } });
  });

  it("retries polling after a transient database failure", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const abort = new AbortController();
    mocks.claimOutboxBatch
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockImplementationOnce(async () => {
        abort.abort();
        return [];
      });

    const dispatcher = new OutboxDispatcher({} as Database, new Map());
    const run = dispatcher.run(abort.signal);
    await vi.advanceTimersByTimeAsync(250);
    await run;

    expect(mocks.claimOutboxBatch).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith("outbox dispatcher poll failed; retrying", "database unavailable");
  });
});
