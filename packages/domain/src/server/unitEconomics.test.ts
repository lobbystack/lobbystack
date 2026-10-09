import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueueOutbox: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), enqueueOutbox: mocks.enqueueOutbox }));

import { recordUnitEconomicsEventInTransaction } from "./unitEconomics";

const businessId = "biz-1";
let nextId = 0;
const tx = { insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ id: `event-${++nextId}` }] }) }) }) };

async function recordAt(iso: string) {
  vi.setSystemTime(new Date(iso));
  await recordUnitEconomicsEventInTransaction(tx as never, { businessId, eventKey: iso, eventKind: "dashboard_ai", channel: "web", costUsd: 0.01 });
  return mocks.enqueueOutbox.mock.calls.at(-1)![1] as { dedupeKey: string; availableAt: Date; payload: unknown };
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("recordUnitEconomicsEventInTransaction", () => {
  it("shares one month refresh between events recorded in the same five minutes", async () => {
    vi.useFakeTimers();
    const first = await recordAt("2026-10-03T12:01:00Z");
    const second = await recordAt("2026-10-03T12:04:59Z");
    const later = await recordAt("2026-10-03T12:05:00Z");
    expect(second.dedupeKey).toBe(first.dedupeKey);
    expect(first).toMatchObject({ availableAt: new Date("2026-10-03T12:05:30Z"), payload: { monthKey: "2026-10" } });
    expect(later.dedupeKey).not.toBe(first.dedupeKey);
    expect(later.availableAt).toEqual(new Date("2026-10-03T12:10:30Z"));
  });
});
