import { createQueue, type JobQueue, type JobType } from "@lobbystack/jobs";

export async function configureSchedulers(
  queues = new Map<JobQueue, ReturnType<typeof createQueue>>(),
  businessIds: readonly string[] = [],
): Promise<void> {
  const schedules: Array<{ queue: JobQueue; name: string; type: JobType; every: number }> = [
    { queue: "maintenance", name: "privacy-retention-sweep", type: "privacy.scrubMessage", every: 60 * 60_000 },
    { queue: "maintenance", name: "pending-upload-cleanup", type: "privacy.cleanupPendingUpload", every: 15 * 60_000 },
    { queue: "default", name: "calendar-reconcile", type: "calendar.reconcileBusiness", every: 15 * 60_000 },
    { queue: "maintenance", name: "phone-number-reclaim", type: "phoneNumber.reclaim", every: 60 * 60_000 },
    { queue: "maintenance", name: "operator-daily-summary", type: "notification.dailySummary", every: 60_000 },
    { queue: "maintenance", name: "telemetry-flush", type: "telemetry.flush", every: 60_000 },
    { queue: "maintenance", name: "unit-economics-rollup", type: "billing.refreshUnitEconomics", every: 60 * 60_000 },
  ];
  const payoutQueue = queues.get("maintenance");
  if (payoutQueue) {
    await payoutQueue.upsertJobScheduler("prospect-demo-expiry", { every: 60 * 60_000 }, { name: "prospectDemo.expire", data: { jobId: "prospect-demo-expiry", type: "prospectDemo.expire", queue: "maintenance", businessId: null, payload: {}, trace: {}, idempotencyKey: "prospect-demo-expiry", scheduled: true } });
    await payoutQueue.upsertJobScheduler("affiliate-payout", { every: 24 * 60 * 60_000 }, { name: "affiliate.generatePayoutRun", data: { jobId: "affiliate-payout", type: "affiliate.generatePayoutRun", queue: "maintenance", businessId: null, payload: {}, trace: {}, idempotencyKey: "affiliate-payout", scheduled: true } });
  }
  for (const businessId of businessIds) {
    for (const schedule of schedules) {
      const queue = queues.get(schedule.queue);
      if (!queue) {
        continue;
      }
      const name = `${schedule.name}:${businessId}`;
      await queue.upsertJobScheduler(name, { every: schedule.every }, { name: schedule.type, data: { jobId: name, type: schedule.type, queue: schedule.queue, businessId, payload: {}, trace: {}, idempotencyKey: name, scheduled: true } });
    }
  }
}
