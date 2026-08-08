import { describe, expect, it, vi } from "vitest";

import { repeatableJobId } from "@lobbystack/jobs";

import {
  MAINTENANCE_REPEATABLE_JOBS,
  maintenanceQueueName,
  registerMaintenanceSchedules,
} from "./scheduler.js";

describe("maintenance scheduler", () => {
  it("uses stable repeatable job identifiers", () => {
    expect(repeatableJobId("telemetry.flush")).toBe("schedule:telemetry.flush");
    expect(
      repeatableJobId("privacy.cleanupPendingUpload", "daily-cleanup"),
    ).toBe("daily-cleanup");
  });

  it("targets the maintenance queue", () => {
    expect(maintenanceQueueName()).toBe("lobbystack-maintenance");
  });

  it("registers cron schedules on the maintenance queue", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const maintenanceQueue = { add } as never;

    await registerMaintenanceSchedules(maintenanceQueue);

    expect(add).toHaveBeenCalledTimes(MAINTENANCE_REPEATABLE_JOBS.length);

    for (const schedule of MAINTENANCE_REPEATABLE_JOBS) {
      expect(add).toHaveBeenCalledWith(
        schedule.jobType,
        expect.objectContaining({
          jobId: schedule.jobId,
          jobType: schedule.jobType,
        }),
        expect.objectContaining({
          jobId: schedule.jobId,
          repeat: {
            pattern: schedule.cron,
          },
        }),
      );
    }
  });
});
