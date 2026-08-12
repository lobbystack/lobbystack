import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({
  claimOutboxBatch: vi.fn(),
}));

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/db")>()),
  claimOutboxBatch: mocks.claimOutboxBatch,
}));

import { OutboxDispatcher } from "./outboxDispatcher";

describe("OutboxDispatcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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
