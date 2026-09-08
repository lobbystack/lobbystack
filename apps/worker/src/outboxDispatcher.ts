import { randomUUID } from "node:crypto";

import { claimOutboxBatch, markOutboxFailed, markOutboxPublished, type Database } from "@lobbystack/db";
import { createQueue, enqueueJob, isKnownJobType, queueForJobType, type JobType } from "@lobbystack/jobs";
import { outboxMessageSchema } from "@lobbystack/contracts";
import { getMeter, redactOtelExceptionText } from "@lobbystack/telemetry/node";

function waitForNextPoll(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timeout = setTimeout(done, delayMs);
    signal.addEventListener("abort", done, { once: true });
  });
}

export class OutboxDispatcher {
  private readonly dispatcherId = randomUUID();
  private readonly dispatchFailures = getMeter("lobbystack-worker").createCounter("lobbystack.outbox.dispatch_failures");
  private readonly deadLettered = getMeter("lobbystack-worker").createCounter("lobbystack.outbox.dead_lettered");
  private readonly pollFailures = getMeter("lobbystack-worker").createCounter("lobbystack.outbox.poll_failures");
  private readonly publishDuration = getMeter("lobbystack-worker").createHistogram("lobbystack.outbox.publish_duration_ms", { unit: "ms" });
  private readonly published = getMeter("lobbystack-worker").createCounter("lobbystack.outbox.published");
  private readonly publishAge = getMeter("lobbystack-worker").createHistogram("lobbystack.outbox.publish_age_ms", { unit: "ms" });
  private stopped = false;

  constructor(private readonly db: Database, private readonly queues: Map<string, ReturnType<typeof createQueue>>) {}

  async dispatchOnce(): Promise<number> {
    const rows = await claimOutboxBatch(this.db, { dispatcherId: this.dispatcherId, limit: 50 });
    for (const row of rows) {
      const started = performance.now();
      let outcome = "success";
      const topic = isKnownJobType(row.topic) ? row.topic : "unknown";
      try {
        const payload = outboxMessageSchema.parse({ id: row.id, topic: row.topic, businessId: row.businessId, aggregateType: row.aggregateType, aggregateId: row.aggregateId, dedupeKey: row.dedupeKey, payload: row.payload, trace: { ...(row.traceparent ? { traceparent: row.traceparent } : {}), ...(row.tracestate ? { tracestate: row.tracestate } : {}) } });
        const type = payload.topic as JobType;
        const queueName = queueForJobType[type];
        const queue = queueName ? this.queues.get(queueName) : undefined;
        if (!queue) {
          throw new Error(`No queue configured for outbox topic ${payload.topic}.`);
        }
        await enqueueJob(queue, { type, businessId: payload.businessId ?? undefined, payload: payload.payload, trace: payload.trace, idempotencyKey: payload.dedupeKey });
        await markOutboxPublished(this.db, row.id);
        this.published.add(1, { topic });
        this.publishAge.record(Math.max(0, Date.now() - row.createdAt.getTime()), { topic });
      } catch (error) {
        outcome = "error";
        const attributes = { "lobbystack.outbox.topic": row.topic };
        const deadLettered = await markOutboxFailed(this.db, row.id, error, new Date(Date.now() + Math.min(300_000, 2 ** row.attempts * 1000)));
        this.dispatchFailures.add(1, attributes);
        if (deadLettered) {
          this.deadLettered.add(1, attributes);
        }
      } finally {
        this.publishDuration.record(performance.now() - started, { topic, outcome });
      }
    }
    return rows.length;
  }

  async run(signal: AbortSignal): Promise<void> {
    let consecutiveFailures = 0;
    while (!signal.aborted && !this.stopped) {
      try {
        const count = await this.dispatchOnce();
        consecutiveFailures = 0;
        if (count === 0) {
          await waitForNextPoll(signal, 500);
        }
      } catch (error) {
        consecutiveFailures += 1;
        this.pollFailures.add(1);
        console.error("outbox dispatcher poll failed; retrying", redactOtelExceptionText(error instanceof Error ? error.message : String(error)));
        await waitForNextPoll(signal, Math.min(5_000, 250 * 2 ** (consecutiveFailures - 1)));
      }
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
