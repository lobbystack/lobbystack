import { createQueue, type JobQueue, type JobType } from "@lobbystack/jobs";

export async function configureSchedulers(
  queues = new Map<JobQueue, ReturnType<typeof createQueue>>(),
  businesses: ReadonlyArray<{ id: string; hasMembers: boolean }> = [],
): Promise<void> {
  // A business with no active member, such as an expired prospect demo, runs a
  // job every `idleEvery` instead, or not at all when that is 0. The per-minute
  // jobs only matter to a business someone can sign in to or call.
  const schedules: Array<{ queue: JobQueue; name: string; type: JobType; every: number; idleEvery?: number }> = [
    { queue: "maintenance", name: "privacy-retention-sweep", type: "privacy.scrubMessage", every: 60 * 60_000 },
    { queue: "maintenance", name: "pending-upload-cleanup", type: "privacy.cleanupPendingUpload", every: 15 * 60_000 },
    { queue: "default", name: "calendar-reconcile", type: "calendar.reconcileBusiness", every: 15 * 60_000 },
    { queue: "maintenance", name: "phone-number-reclaim", type: "phoneNumber.reclaim", every: 60 * 60_000 },
    { queue: "maintenance", name: "operator-daily-summary", type: "notification.dailySummary", every: 60_000, idleEvery: 0 },
    // A closed demo still records events (a failed claim, a call that ends late), and only this job sends them.
    { queue: "maintenance", name: "telemetry-flush", type: "telemetry.flush", every: 60_000, idleEvery: 60 * 60_000 },
    { queue: "maintenance", name: "outbox-backlog-sample", type: "outbox.backlogSample", every: 60_000, idleEvery: 0 },
    { queue: "maintenance", name: "unit-economics-rollup", type: "billing.refreshUnitEconomics", every: 60 * 60_000 },
    { queue: "maintenance", name: "api-retention", type: "api.retention", every: 60 * 60_000 },
    // A call whose worker died keeps talking with nobody answering, so look every minute.
    { queue: "critical", name: "live-orphan-recovery", type: "live.recoverOrphans", every: 60_000, idleEvery: 0 },
  ];
  const payoutQueue = queues.get("maintenance");
  if (payoutQueue) {
    await payoutQueue.upsertJobScheduler("prospect-demo-expiry", { every: 60 * 60_000 }, { name: "prospectDemo.expire", data: { jobId: "prospect-demo-expiry", type: "prospectDemo.expire", queue: "maintenance", businessId: null, payload: {}, trace: {}, idempotencyKey: "prospect-demo-expiry", scheduled: true, recurring: true } });
    await payoutQueue.upsertJobScheduler("affiliate-payout", { every: 24 * 60 * 60_000 }, { name: "affiliate.generatePayoutRun", data: { jobId: "affiliate-payout", type: "affiliate.generatePayoutRun", queue: "maintenance", businessId: null, payload: {}, trace: {}, idempotencyKey: "affiliate-payout", scheduled: true, recurring: true } });
  }
  for (const { id: businessId, hasMembers } of businesses) {
    for (const schedule of schedules) {
      const queue = queues.get(schedule.queue);
      if (!queue) {
        continue;
      }
      const name = `${schedule.name}:${businessId}`;
      const every = hasMembers ? schedule.every : schedule.idleEvery ?? schedule.every;
      if (!every) {
        await queue.removeJobScheduler(name);
        continue;
      }
      await queue.upsertJobScheduler(name, { every }, { name: schedule.type, data: { jobId: name, type: schedule.type, queue: schedule.queue, businessId, payload: {}, trace: {}, idempotencyKey: name, scheduled: true, recurring: true } });
    }
  }
}
