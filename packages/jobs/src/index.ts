import { createHash } from "node:crypto";

import { jobEnvelopeSchema, jobTypes, type JobEnvelope, type JobQueue, type JobType } from "@lobbystack/contracts";
import { Queue, type JobsOptions, type QueueOptions, type WorkerOptions } from "bullmq";
import Redis from "ioredis";

import { logRedisErrors } from "./redisErrors";

export { jobEnvelopeSchema, jobQueues, jobTypes, queueForJobType } from "@lobbystack/contracts";
export type { JobEnvelope, JobQueue, JobType } from "@lobbystack/contracts";

export type JobPayload = Record<string, unknown>;

export type EnqueueJobInput = {
  type: JobType;
  businessId?: string | undefined;
  payload: JobPayload;
  trace?: { traceparent?: string | undefined; tracestate?: string | undefined };
  idempotencyKey: string;
  delayMs?: number;
};

export type RedisClientOptions = {
  url?: string;
  prefix?: string;
};

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
export function createRedisConnection(options: RedisClientOptions = {}): Redis {
  const connectionName = `${options.prefix ?? process.env.REDIS_PREFIX ?? "lobbystack"}:client`;
  return logRedisErrors(new Redis(options.url ?? process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectionName,
  }), connectionName);
}

export function createQueue(
  queue: JobQueue,
  options: RedisClientOptions & Partial<QueueOptions> = {},
): Queue<JobEnvelope> {
  const { url, prefix, ...queueOptions } = options;
  return new Queue<JobEnvelope>(queue, {
    ...queueOptions,
    prefix: prefix ?? process.env.REDIS_PREFIX ?? "lobbystack",
    connection: createRedisConnection({ ...(url !== undefined ? { url } : {}), ...(prefix !== undefined ? { prefix } : {}) }),
    defaultJobOptions: {
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800, count: 5000 },
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      ...(queueOptions.defaultJobOptions ?? {}),
    },
  });
}

export async function enqueueJob(
  queue: Queue<JobEnvelope>,
  input: EnqueueJobInput,
): Promise<string> {
  const digest = createHash("sha256").update(`${input.type}:${input.idempotencyKey}`).digest("hex");
  const jobId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${(parseInt(digest.slice(16, 18), 16) & 0x3f | 0x80).toString(16).padStart(2, "0")}${digest.slice(18, 20)}-${digest.slice(20, 32)}`;
  const envelope = jobEnvelopeSchema.parse({
    jobId,
    type: input.type,
    queue: queue.name,
    businessId: input.businessId ?? null,
    payload: input.payload,
    trace: input.trace ?? {},
    idempotencyKey: input.idempotencyKey,
    scheduled: (input.delayMs ?? 0) > 0,
  });
  // Attempts and backoff come from the queue's defaultJobOptions.
  const options: JobsOptions = {
    jobId,
    ...(input.delayMs !== undefined ? { delay: input.delayMs } : {}),
  };
  await queue.add(input.type, envelope, options);
  return jobId;
}

export function createWorkerOptions(
  queue: JobQueue,
  options: RedisClientOptions & Partial<WorkerOptions> = {},
): WorkerOptions {
  const { url, prefix, ...workerOptions } = options;
  return {
    ...workerOptions,
    prefix: prefix ?? process.env.REDIS_PREFIX ?? "lobbystack",
    connection: createRedisConnection({ ...(url !== undefined ? { url } : {}), ...(prefix !== undefined ? { prefix } : {}) }),
    concurrency: workerOptions.concurrency ?? (queue === "bulk" ? 2 : 8),
  };
}

export function isKnownJobType(value: string): value is JobType {
  return (jobTypes as readonly string[]).includes(value);
}

export * from "./voicePresence";
export { logRedisErrors } from "./redisErrors";
