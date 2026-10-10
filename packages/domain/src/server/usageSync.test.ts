import { describe, expect, it, vi } from "vitest";

const outbox = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), enqueueOutbox: outbox.enqueue }));

import { enqueueUsageSyncInTransaction } from "./usage";

describe("billing usage sync", () => {
  it("syncs an alert text when Twilio reports the segment count that was reserved", async () => {
    let event = { quantity: 1, syncStatus: "pending", isFinal: false };
    // Like the outbox's unique dedupe key: a second row with the same key is dropped.
    const queued = new Map<string, { finalWhenQueued: boolean }>();
    outbox.enqueue.mockImplementation(async (_tx, row: { dedupeKey: string }) => { if (!queued.has(row.dedupeKey)) queued.set(row.dedupeKey, { finalWhenQueued: event.isFinal }); });
    const tx = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [event] }) }) }) } as never;

    // Right after the send the reservation is still a draft.
    await enqueueUsageSyncInTransaction(tx, { businessId: "business-1", usageEventId: "usage-1" });
    // Twilio reports 1 segment, the same as the estimate, and the event turns final.
    event = { ...event, isFinal: true };
    await enqueueUsageSyncInTransaction(tx, { businessId: "business-1", usageEventId: "usage-1" });

    expect([...queued]).toEqual([["billing-usage:usage-1:sync:1", { finalWhenQueued: true }]]);
  });
});
