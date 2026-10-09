import { describe, expect, it, vi } from "vitest";

import type { JobQueue } from "@lobbystack/jobs";

import { configureSchedulers, type Schedule } from "./scheduler";

function fakeQueues() {
  const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
  const removeJobScheduler = vi.fn().mockResolvedValue(true);
  const queue = { upsertJobScheduler, removeJobScheduler };
  const queues = new Map<JobQueue, never>([["maintenance", queue as never], ["default", queue as never], ["critical", queue as never]]);
  return { queues: queues as never, upsertJobScheduler, removeJobScheduler };
}

describe("worker schedulers", () => {
  it("creates tenant-scoped schedules and one orphan recovery job for all businesses", async () => {
    const { queues, upsertJobScheduler, removeJobScheduler } = fakeQueues();

    await configureSchedulers(queues, [{ id: "business-a", active: true }, { id: "business-b", active: true }]);

    expect(upsertJobScheduler).toHaveBeenCalledTimes(21);
    const tenantCalls = upsertJobScheduler.mock.calls.filter((call) => call[2].data.businessId !== null);
    expect(tenantCalls).toHaveLength(18);
    expect(tenantCalls.filter((call) => call[2].data.type === "api.retention")).toHaveLength(2);
    for (const call of tenantCalls) {
      expect(call[2].data.businessId).toMatch(/^business-[ab]$/);
      expect(call[2].data.recurring).toBe(true);
    }
    // Calls left without a worker are found within about a minute, by one job.
    expect(upsertJobScheduler.mock.calls.filter((call) => call[2].data.type === "live.recoverOrphans").map((call) => [call[0], call[1], call[2].data.queue, call[2].data.businessId])).toEqual([
      ["live-orphan-recovery", { every: 60_000 }, "critical", null],
    ]);
    // The per-business recovery schedulers from before go away.
    expect(removeJobScheduler.mock.calls.map((call) => call[0])).toEqual(["live-orphan-recovery:business-a", "live-orphan-recovery:business-b"]);
    expect(upsertJobScheduler.mock.calls.find((call) => call[2].data.type === "affiliate.generatePayoutRun")?.[2].data).toEqual(expect.objectContaining({ businessId: null, recurring: true }));
    expect(upsertJobScheduler.mock.calls.find((call) => call[2].data.type === "prospectDemo.expire")?.[2].data).toEqual(expect.objectContaining({ businessId: null, recurring: true }));
  });

  it("drops the per-minute jobs of a dormant business, keeps its cleanup jobs and flushes its telemetry hourly", async () => {
    const { queues, upsertJobScheduler, removeJobScheduler } = fakeQueues();

    await configureSchedulers(queues, [{ id: "dormant", active: false }]);

    expect(removeJobScheduler.mock.calls.map((call) => call[0]).sort()).toEqual([
      "live-orphan-recovery:dormant",
      "operator-daily-summary:dormant",
      "outbox-backlog-sample:dormant",
    ]);
    const tenantTypes = upsertJobScheduler.mock.calls.filter((call) => call[2].data.businessId === "dormant").map((call) => call[2].data.type);
    expect(tenantTypes).toHaveLength(7);
    expect(tenantTypes).toContain("privacy.scrubMessage");
    expect(upsertJobScheduler).toHaveBeenCalledWith("telemetry-flush:dormant", { every: 60 * 60_000 }, expect.anything());
  });

  it("calls Redis on a refresh only for what changed", async () => {
    const { queues, upsertJobScheduler, removeJobScheduler } = fakeQueues();
    const applied = new Map<string, Schedule>();
    await configureSchedulers(queues, [{ id: "a", active: true }, { id: "b", active: true }], applied);
    upsertJobScheduler.mockClear();
    removeJobScheduler.mockClear();

    await configureSchedulers(queues, [{ id: "a", active: true }, { id: "b", active: true }], applied);
    expect(upsertJobScheduler).not.toHaveBeenCalled();
    expect(removeJobScheduler).not.toHaveBeenCalled();

    // b goes dormant: only its three per-minute schedulers change.
    await configureSchedulers(queues, [{ id: "a", active: true }, { id: "b", active: false }], applied);
    expect(removeJobScheduler.mock.calls.map((call) => call[0]).sort()).toEqual(["operator-daily-summary:b", "outbox-backlog-sample:b"]);
    expect(upsertJobScheduler.mock.calls.map((call) => [call[0], call[1]])).toEqual([["telemetry-flush:b", { every: 60 * 60_000 }]]);
    upsertJobScheduler.mockClear();
    removeJobScheduler.mockClear();

    // b leaves the list: the schedulers it still has go, and nothing else changes.
    await configureSchedulers(queues, [{ id: "a", active: true }], applied);
    expect(upsertJobScheduler).not.toHaveBeenCalled();
    expect(removeJobScheduler.mock.calls.map((call) => call[0]).sort()).toEqual([
      "api-retention:b",
      "calendar-reconcile:b",
      "pending-upload-cleanup:b",
      "phone-number-reclaim:b",
      "privacy-retention-sweep:b",
      "telemetry-flush:b",
      "unit-economics-rollup:b",
    ]);
    expect([...applied.keys()].some((name) => name.endsWith(":b"))).toBe(false);
  });

  it("tries a failed call again on the next refresh", async () => {
    const { queues, upsertJobScheduler } = fakeQueues();
    const applied = new Map<string, Schedule>();
    upsertJobScheduler.mockRejectedValueOnce(new Error("Redis is down"));
    await expect(configureSchedulers(queues, [], applied)).rejects.toThrow("Redis is down");
    upsertJobScheduler.mockClear();

    await configureSchedulers(queues, [], applied);
    expect(upsertJobScheduler.mock.calls.map((call) => call[0])).toEqual(["prospect-demo-expiry", "affiliate-payout", "live-orphan-recovery"]);
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
