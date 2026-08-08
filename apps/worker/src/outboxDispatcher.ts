import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { traceContextSchema } from "@lobbystack/contracts";
import {
  claimOutboxBatch,
  completeOutboxMessage,
  failOutboxMessage,
} from "@lobbystack/db/outbox";
import { schema } from "@lobbystack/db";
import {
  OUTBOX_TOPICS,
  queueForJob,
  queueKey,
  type OutboxTopic,
  type QueueJob,
  type QueueName,
} from "@lobbystack/jobs";
import type { TelemetryLogger } from "@lobbystack/telemetry/node";
import { injectTraceContext, withSpan } from "@lobbystack/telemetry/node";
import type { Queue } from "bullmq";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { traceCarrierFromContext } from "./handlers.js";

const OUTBOX_JOB_TYPE = "realtime.publish" as const;
const MAX_OUTBOX_ATTEMPTS = 10;

export type OutboxDispatcherOptions = {
  dispatcherPool: Pool;
  queues: Record<QueueName, Queue>;
  logger: TelemetryLogger;
  workerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  signal?: AbortSignal;
};

function outboxJobId(messageId: string): string {
  return `outbox:${messageId}`;
}

function isDuplicateJobError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("job") &&
    (message.includes("exists") ||
      message.includes("duplicate") ||
      message.includes("already"))
  );
}

function parseTraceContext(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (!record.traceContext) {
    return undefined;
  }

  const parsed = traceContextSchema.safeParse(record.traceContext);
  return parsed.success ? parsed.data : undefined;
}

function isOutboxTopic(topic: string): topic is OutboxTopic {
  return (OUTBOX_TOPICS as readonly string[]).includes(topic);
}

async function enqueueOutboxMessage(
  queues: Record<QueueName, Queue>,
  message: Awaited<ReturnType<typeof claimOutboxBatch>>[number],
  logger: TelemetryLogger,
): Promise<void> {
  if (!isOutboxTopic(message.topic)) {
    throw new Error(`Unsupported outbox topic: ${message.topic}`);
  }

  const traceContext = parseTraceContext(message.payloadJson);
  const carrier = traceCarrierFromContext(traceContext);
  const jobId = outboxJobId(message.id);
  const queueName = queueForJob(OUTBOX_JOB_TYPE);
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue not configured for ${OUTBOX_JOB_TYPE}`);
  }

  const jobData: QueueJob<typeof OUTBOX_JOB_TYPE> = {
    jobId,
    jobType: OUTBOX_JOB_TYPE,
    payload: {
      outboxMessageId: message.id,
    },
    ...(traceContext ? { traceContext } : {}),
  };

  const runEnqueue = async () => {
    if (carrier) {
      const propagationCarrier: Record<string, string> = {};
      injectTraceContext(propagationCarrier);
      Object.assign(propagationCarrier, carrier);
    }

    try {
      await queue.add(OUTBOX_JOB_TYPE, jobData, {
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1_000,
        },
      });
    } catch (error) {
      if (isDuplicateJobError(error)) {
        logger.info("Outbox job already enqueued", {
          outboxMessageId: message.id,
          jobId,
        });
        return;
      }
      throw error;
    }
  };

  if (carrier) {
    const { context, propagation, ROOT_CONTEXT } = await import("@opentelemetry/api");
    const parentContext = propagation.extract(ROOT_CONTEXT, carrier, {
      get: (target, key) => target[key],
      keys: (target) => Object.keys(target),
    });
    await context.with(parentContext, runEnqueue);
    return;
  }

  await withSpan(
    "outbox.enqueue",
    async () => {
      await runEnqueue();
    },
    {
      outboxMessageId: message.id,
      topic: message.topic,
      queue: queueKey(queueName),
    },
  );
}

export async function dispatchOutboxBatch(
  options: OutboxDispatcherOptions,
): Promise<number> {
  const db = drizzle(options.dispatcherPool, { schema });
  const workerId = options.workerId ?? `${hostname()}:${process.pid}`;
  const batchSize = options.batchSize ?? 25;

  const claimed = await claimOutboxBatch(db, {
    workerId,
    limit: batchSize,
  });

  if (claimed.length === 0) {
    return 0;
  }

  let published = 0;

  for (const message of claimed) {
    try {
      await enqueueOutboxMessage(options.queues, message, options.logger);
      await completeOutboxMessage(db, message.id);
      published += 1;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to publish outbox message";
      const attempts = message.attempts ?? 0;
      const dead = attempts >= MAX_OUTBOX_ATTEMPTS;
      const retryAt = new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** attempts));

      await failOutboxMessage(db, message.id, errorMessage, {
        dead,
        retryAt,
      });

      options.logger.error("Failed to dispatch outbox message", {
        outboxMessageId: message.id,
        topic: message.topic,
        attempts,
        dead,
        error: errorMessage,
      });
    }
  }

  return published;
}

export async function startOutboxDispatcher(
  options: OutboxDispatcherOptions,
): Promise<() => Promise<void>> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  let running = true;

  const loop = async () => {
    while (running && !options.signal?.aborted) {
      try {
        const published = await dispatchOutboxBatch(options);
        if (published === 0) {
          await sleep(pollIntervalMs, options.signal);
        }
      } catch (error) {
        options.logger.error("Outbox dispatcher tick failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(pollIntervalMs, options.signal);
      }
    }
  };

  void loop();

  return async () => {
    running = false;
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export function createOutboxDispatcherWorkerId(): string {
  return `dispatcher:${hostname()}:${process.pid}:${randomUUID()}`;
}
