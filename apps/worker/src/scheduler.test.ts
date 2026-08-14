import { describe, expect, it, vi } from "vitest";

import type { JobQueue } from "@lobbystack/jobs";

import { configureSchedulers } from "./scheduler";

describe("worker schedulers", () => {
  it("creates tenant-scoped schedules instead of jobs without business context", async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    const queue = { upsertJobScheduler };
    const queues = new Map<JobQueue, never>([
      ["maintenance", queue as never],
      ["default", queue as never],
    ]);

    await configureSchedulers(queues as never, ["business-a", "business-b"]);

    expect(upsertJobScheduler).toHaveBeenCalledTimes(16);
    const tenantCalls = upsertJobScheduler.mock.calls.filter((call) => call[2].data.businessId !== null);
    expect(tenantCalls).toHaveLength(14);
    for (const call of tenantCalls) {
      expect(call[2].data.businessId).toMatch(/^business-[ab]$/);
      expect(call[2].data.businessId).not.toBeNull();
    }
    expect(upsertJobScheduler.mock.calls.find((call) => call[2].data.type === "affiliate.generatePayoutRun")?.[2].data.businessId).toBeNull();
    expect(upsertJobScheduler.mock.calls.find((call) => call[2].data.type === "prospectDemo.expire")?.[2].data.businessId).toBeNull();
  });

  it("does not register tenant jobs when no businesses are available", async () => {
    const upsertJobScheduler = vi.fn();
    const queues = new Map([["maintenance", { upsertJobScheduler }] as never, ["default", { upsertJobScheduler }] as never]);

    await configureSchedulers(queues as never);

    expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(upsertJobScheduler.mock.calls.map((call) => call[2].data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "affiliate.generatePayoutRun", businessId: null }),
      expect.objectContaining({ type: "prospectDemo.expire", businessId: null }),
    ]));
  });
});
