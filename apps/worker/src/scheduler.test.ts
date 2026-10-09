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
      ["critical", queue as never],
    ]);

    await configureSchedulers(queues as never, [{ id: "business-a", hasMembers: true }, { id: "business-b", hasMembers: true }]);

    expect(upsertJobScheduler).toHaveBeenCalledTimes(22);
    const tenantCalls = upsertJobScheduler.mock.calls.filter((call) => call[2].data.businessId !== null);
    expect(tenantCalls).toHaveLength(20);
    expect(tenantCalls.filter((call) => call[2].data.type === "api.retention")).toHaveLength(2);
    // Calls left without a worker are found within about a minute.
    expect(tenantCalls.filter((call) => call[2].data.type === "live.recoverOrphans").map((call) => [call[0], call[1], call[2].data.queue])).toEqual([
      ["live-orphan-recovery:business-a", { every: 60_000 }, "critical"],
      ["live-orphan-recovery:business-b", { every: 60_000 }, "critical"],
    ]);
    for (const call of tenantCalls) {
      expect(call[2].data.businessId).toMatch(/^business-[ab]$/);
      expect(call[2].data.businessId).not.toBeNull();
      expect(call[2].data.recurring).toBe(true);
    }
    expect(upsertJobScheduler.mock.calls.find((call) => call[2].data.type === "affiliate.generatePayoutRun")?.[2].data).toEqual(expect.objectContaining({ businessId: null, recurring: true }));
    expect(upsertJobScheduler.mock.calls.find((call) => call[2].data.type === "prospectDemo.expire")?.[2].data).toEqual(expect.objectContaining({ businessId: null, recurring: true }));
  });

  it("drops the per-minute jobs of a business with no active member, keeps its cleanup jobs and flushes its telemetry hourly", async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    const removeJobScheduler = vi.fn().mockResolvedValue(true);
    const queue = { upsertJobScheduler, removeJobScheduler };
    const queues = new Map<JobQueue, never>([["maintenance", queue as never], ["default", queue as never], ["critical", queue as never]]);

    await configureSchedulers(queues as never, [{ id: "expired-demo", hasMembers: false }]);

    expect(removeJobScheduler.mock.calls.map((call) => call[0]).sort()).toEqual([
      "live-orphan-recovery:expired-demo",
      "operator-daily-summary:expired-demo",
      "outbox-backlog-sample:expired-demo",
    ]);
    const tenantTypes = upsertJobScheduler.mock.calls.filter((call) => call[2].data.businessId === "expired-demo").map((call) => call[2].data.type);
    expect(tenantTypes).toHaveLength(7);
    expect(tenantTypes).toContain("privacy.scrubMessage");
    expect(upsertJobScheduler).toHaveBeenCalledWith("telemetry-flush:expired-demo", { every: 60 * 60_000 }, expect.anything());
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
