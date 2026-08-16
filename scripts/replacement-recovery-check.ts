import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";

import { createDatabaseClient, enqueueOutbox, outboxMessages, withDispatcherTransaction } from "@lobbystack/db";
import { createQueue, createRedisConnection, enqueueJob } from "@lobbystack/jobs";
import { OutboxDispatcher } from "../apps/worker/src/outboxDispatcher";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForRedis(redis: ReturnType<typeof createRedisConnection>): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      if (redis.status !== "ready") await redis.connect();
      if (await redis.ping() === "PONG") return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Redis did not recover within five seconds.");
}

async function closeQueue(queue: ReturnType<typeof createQueue>): Promise<void> {
  await Promise.race([queue.close(), new Promise<void>((resolve) => setTimeout(resolve, 1_000))]);
  queue.connection.disconnect();
}

async function waitForWorker(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health/ready`);
      if (response.ok) return;
    } catch {
      // The worker is expected to be unavailable briefly during restart.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Worker did not become ready after restart.");
}

async function waitForCompletedJob(queue: ReturnType<typeof createQueue>, idempotencyKey: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const jobs = await queue.getJobs(["waiting", "active", "completed", "failed"]);
    const job = jobs.find((candidate) => candidate.data.idempotencyKey === idempotencyKey);
    if (job && await job.getState() === "completed") return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Post-restart worker job did not complete.");
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:16380";
  const workerCheck = process.env.RECOVERY_CHECK_WORKER === "1";
  const prefix = workerCheck ? (process.env.RECOVERY_WORKER_REDIS_PREFIX ?? process.env.REDIS_PREFIX ?? "lobbystack") : `${process.env.REDIS_PREFIX ?? "lobbystack"}:recovery-${randomUUID()}`;
  const recoveryType: "realtime.publish" | "prospectDemo.expire" = workerCheck ? "prospectDemo.expire" : "realtime.publish";
  const recoveryQueueName = workerCheck ? "maintenance" : "default";
  const dispatcherDatabase = createDatabaseClient("lobbystack_dispatcher");
  const queue = createQueue(recoveryQueueName, { url: redisUrl, prefix });
  const probe = createRedisConnection({ url: redisUrl, prefix: `${prefix}:probe` });
  let reconnectedProbe: ReturnType<typeof createRedisConnection> | undefined;
  const dedupeKey = `recovery:${randomUUID()}`;
  const secondDedupeKey = `recovery:${randomUUID()}`;
  const outboxIds: string[] = [];
  try {
    await queue.waitUntilReady();
    await waitForRedis(probe);
    const payload = recoveryType === "realtime.publish" ? { type: "document.progressed" } : {};
    const firstJobId = await enqueueJob(queue, { type: recoveryType, payload, idempotencyKey: dedupeKey });
    const duplicateJobId = await enqueueJob(queue, { type: recoveryType, payload, idempotencyKey: dedupeKey });
    assert(firstJobId === duplicateJobId, "Duplicate BullMQ enqueue did not derive the same job id.");
    const duplicateJobs = await queue.getJobs(["waiting", "delayed", "active", "completed"]);
    assert(duplicateJobs.filter((job) => job.id === firstJobId).length === 1, "Duplicate BullMQ enqueue created multiple jobs.");

    const outboxId = await withDispatcherTransaction(dispatcherDatabase.db, async (tx) => await enqueueOutbox(tx, { topic: recoveryType, aggregateType: "recovery", dedupeKey, payload }));
    outboxIds.push(outboxId);
    const dispatcher = new OutboxDispatcher(dispatcherDatabase.db, new Map([[recoveryQueueName, queue]]));
    assert(await dispatcher.dispatchOnce() === 1, "Outbox dispatcher did not claim the recovery message.");
    const published = await withDispatcherTransaction(dispatcherDatabase.db, async (tx) => await tx.select({ publishedAt: outboxMessages.publishedAt }).from(outboxMessages).where(eq(outboxMessages.id, outboxId)).limit(1));
    assert(Boolean(published[0]?.publishedAt), "Outbox message was not marked published after queue acceptance.");

    await probe.set(`recovery:${randomUUID()}`, "before-reconnect");
    await probe.disconnect();
    reconnectedProbe = createRedisConnection({ url: redisUrl, prefix: `${prefix}:reconnect` });
    await waitForRedis(reconnectedProbe);
    assert(await reconnectedProbe.ping() === "PONG", "Redis client did not reconnect.");

    const restartProject = process.env.RECOVERY_COMPOSE_PROJECT;
    if (restartProject) {
      const composeFile = process.env.RECOVERY_COMPOSE_FILE ?? `${root}docker-compose.yml`;
      const restart = spawnSync("docker", ["compose", "--project-name", restartProject, "-f", composeFile, "restart", "redis"], { cwd: root, encoding: "utf8" });
      if (restart.status !== 0) throw new Error(restart.stderr || "Redis restart failed.");
      await waitForRedis(reconnectedProbe);
      if (workerCheck) {
        const workerRestart = spawnSync("docker", ["compose", "--project-name", restartProject, "-f", composeFile, "restart", "worker"], { cwd: root, encoding: "utf8" });
        if (workerRestart.status !== 0) throw new Error(workerRestart.stderr || "Worker restart failed.");
        await waitForWorker(process.env.RECOVERY_WORKER_BASE_URL ?? "http://127.0.0.1:13002");
      }
      const secondPayload = recoveryType === "realtime.publish" ? { type: "document.progressed" } : {};
      const secondOutboxId = await withDispatcherTransaction(dispatcherDatabase.db, async (tx) => await enqueueOutbox(tx, { topic: recoveryType, aggregateType: "recovery", dedupeKey: secondDedupeKey, payload: secondPayload }));
      outboxIds.push(secondOutboxId);
      const dispatcher = new OutboxDispatcher(dispatcherDatabase.db, new Map([[recoveryQueueName, queue]]));
      assert(await dispatcher.dispatchOnce() === 1, "Outbox dispatcher did not recover after Redis restart.");
      const recovered = await withDispatcherTransaction(dispatcherDatabase.db, async (tx) => await tx.select({ publishedAt: outboxMessages.publishedAt }).from(outboxMessages).where(eq(outboxMessages.id, secondOutboxId)).limit(1));
      assert(Boolean(recovered[0]?.publishedAt), "Post-restart outbox message was not published.");
      if (workerCheck) await waitForCompletedJob(queue, secondDedupeKey);
    }

    console.log(JSON.stringify({ duplicateJobIdempotency: true, outboxPublished: true, redisReconnect: true, ...(restartProject ? { redisRestart: true } : {}), ...(workerCheck ? { workerRestart: true, postRestartJobCompleted: true } : {}) }));
  } finally {
    await withDispatcherTransaction(dispatcherDatabase.db, async (tx) => {
      for (const outboxId of outboxIds) await tx.delete(outboxMessages).where(eq(outboxMessages.id, outboxId));
    }).catch(() => undefined);
    probe.disconnect();
    reconnectedProbe?.disconnect();
    await Promise.allSettled([closeQueue(queue), dispatcherDatabase.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
