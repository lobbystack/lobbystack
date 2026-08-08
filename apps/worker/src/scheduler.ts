import type { Queue } from "bullmq";

import {
  queueKey,
  repeatableJobId,
  type JobName,
  type QueueJob,
} from "@lobbystack/jobs";

export type RepeatableMaintenanceJob = {
  jobType: JobName;
  cron: string;
  payload: QueueJob["payload"];
  jobId: string;
};

export const MAINTENANCE_REPEATABLE_JOBS: RepeatableMaintenanceJob[] = [
  {
    jobType: "telemetry.flush",
    cron: "*/5 * * * *",
    payload: {},
    jobId: repeatableJobId("telemetry.flush"),
  },
  {
    jobType: "maintenance.sweep",
    cron: "0 3 * * *",
    payload: {
      kind: "daily",
    },
    jobId: repeatableJobId("maintenance.sweep"),
  },
];

export async function registerMaintenanceSchedules(
  maintenanceQueue: Queue,
): Promise<void> {
  for (const schedule of MAINTENANCE_REPEATABLE_JOBS) {
    const jobData: QueueJob = {
      jobId: schedule.jobId,
      jobType: schedule.jobType,
      payload: schedule.payload,
    };

    await maintenanceQueue.add(schedule.jobType, jobData, {
      jobId: schedule.jobId,
      repeat: {
        pattern: schedule.cron,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}

export async function clearMaintenanceSchedules(
  maintenanceQueue: Queue,
): Promise<void> {
  const repeatableJobs = await maintenanceQueue.getRepeatableJobs();

  await Promise.all(
    repeatableJobs.map((job) =>
      maintenanceQueue.removeRepeatableByKey(job.key),
    ),
  );
}

export function maintenanceQueueName(): string {
  return queueKey("maintenance");
}
