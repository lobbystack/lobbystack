import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { enqueueOutbox } from "@lobbystack/db";

const mocks = vi.hoisted(() => {
  const numberId = "8b0f0f5e-3a43-4f4e-9d39-6f1f0c2b7a11";
  const query = { from: () => query, where: async () => [{ id: numberId }] };
  return { numberId, select: () => query };
});

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  withBusinessTransaction: async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: mocks.select }),
  enqueueOutbox: vi.fn(async () => randomUUID()),
}));

import { handleJob } from "./handlers";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function sweep(businessId: string): JobEnvelope {
  return { jobId: randomUUID(), type: "phoneNumber.reclaim", queue: "maintenance", businessId, payload: {}, trace: {}, idempotencyKey: `phone-number-reclaim:${businessId}`, scheduled: true, recurring: true };
}

describe("phoneNumber.reclaim sweep", () => {
  it("queues a new release each hour, so a failed release is tried again", async () => {
    const businessId = randomUUID();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T14:05:00Z"));
    await handleJob(sweep(businessId), { domain: { db: {} as never } });
    vi.setSystemTime(new Date("2026-10-09T15:05:00Z"));
    await handleJob(sweep(businessId), { domain: { db: {} as never } });

    const keys = vi.mocked(enqueueOutbox).mock.calls.map(([, input]) => input.dedupeKey);
    expect(keys).toEqual([`phone-number:${mocks.numberId}:reclaim:2026-10-09T14`, `phone-number:${mocks.numberId}:reclaim:2026-10-09T15`]);
  });
});
