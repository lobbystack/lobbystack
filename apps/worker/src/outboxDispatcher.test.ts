import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({
  claimOutboxBatch: vi.fn(),
  markOutboxPublished: vi.fn(),
  markOutboxFailed: vi.fn(),
  enqueueJob: vi.fn(),
  histogramRecords: [] as Array<{ name: string; attributes: Record<string, unknown> }>,
  counterAdds: [] as Array<{ name: string; attributes: Record<string, unknown> }>,
  logEvent: vi.fn(),
  reportError: vi.fn(),
  callContexts: [] as unknown[],
}));

vi.mock("@lobbystack/telemetry/node", () => ({
  getMeter: () => ({
    createCounter: (name: string) => ({ add: (_value: number, attributes: Record<string, unknown>) => mocks.counterAdds.push({ name, attributes }) }),
    createHistogram: (name: string) => ({ record: (_value: number, attributes: Record<string, unknown>) => mocks.histogramRecords.push({ name, attributes }) }),
  }),
  redactOtelExceptionText: (value: string) => value,
  logEvent: mocks.logEvent,
  reportError: mocks.reportError,
  withCallContext: (ids: unknown, callback: () => unknown) => {
    mocks.callContexts.push(ids);
    return callback();
  },
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
    mocks.callContexts.length = 0;
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

  it("logs a failed dispatch with the call it's about, and reports a dead letter", async () => {
    const recording = { ...row, topic: "call.saveRecording", businessId: "00000000-0000-4000-8000-000000000002", payload: { callId: "call_1", sessionId: "rtc_1" }, attempts: 10 };
    mocks.claimOutboxBatch.mockResolvedValue([recording]);
    const error = new Error("queue unavailable");
    mocks.enqueueJob.mockRejectedValue(error);
    mocks.markOutboxFailed.mockResolvedValue(true);
    const queues = new Map(["critical", "default", "bulk", "maintenance"].map((name) => [name, {} as never]));
    await new OutboxDispatcher({} as Database, queues).dispatchOnce();
    expect(mocks.callContexts).toEqual([{ businessId: "00000000-0000-4000-8000-000000000002", callId: "call_1", sessionId: "rtc_1" }]);
    expect(mocks.logEvent).toHaveBeenCalledWith("error", "outbox.dispatch_failed", { topic: "call.saveRecording", outboxId: row.id, attempt: 10, deadLettered: true, error });
    expect(mocks.reportError).toHaveBeenCalledWith(error, { operation: "outbox.dispatch", topic: "call.saveRecording", outboxId: row.id });
  });

  it("logs a failed dispatch that will be retried as a warning, without a report", async () => {
    mocks.claimOutboxBatch.mockResolvedValue([row]);
    mocks.enqueueJob.mockRejectedValue(new Error("queue unavailable"));
    mocks.markOutboxFailed.mockResolvedValue(false);
    const queues = new Map(["critical", "default", "bulk", "maintenance"].map((name) => [name, {} as never]));
    await new OutboxDispatcher({} as Database, queues).dispatchOnce();
    expect(mocks.callContexts).toEqual([{}]);
    expect(mocks.logEvent).toHaveBeenCalledWith("warn", "outbox.dispatch_failed", expect.objectContaining({ topic: "notification.dispatch", attempt: 1, deadLettered: false }));
    expect(mocks.reportError).not.toHaveBeenCalled();
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
    await run;

    expect(mocks.claimOutboxBatch).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith("outbox dispatcher poll failed; retrying", "database unavailable");
  });
});
