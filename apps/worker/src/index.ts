import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { closeAllPools, pools } from "@lobbystack/db/client";
import { schema } from "@lobbystack/db";
import { QUEUE_NAMES, queueKey, type QueueName } from "@lobbystack/jobs";
import { s3StorageConfigFromEnvironment, S3StorageProvider } from "@lobbystack/providers";
import {
  extractTraceContext,
  getLogger,
  initializeTelemetry,
  shutdownTelemetry,
  withSpan,
} from "@lobbystack/telemetry/node";
import { context as otelContext } from "@opentelemetry/api";
import { Queue, Worker } from "bullmq";
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import Redis from "ioredis";

import {
  createHandlerRegistry,
  parseQueueJob,
  runHandler,
  traceCarrierFromContext,
} from "./handlers.js";
import { startHealthServer } from "./health.js";
import {
  createOutboxDispatcherWorkerId,
  startOutboxDispatcher,
} from "./outboxDispatcher.js";
import { registerMaintenanceSchedules } from "./scheduler.js";

for (const envPath of [
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../.env.local"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function redisPrefix(): string {
  return process.env.REDIS_PREFIX ?? "bull";
}

function createRedisConnection(): Redis {
  return new Redis(requireEnv("REDIS_URL"), {
    maxRetriesPerRequest: null,
  });
}

function createStorageProvider(): S3StorageProvider | null {
  const config = s3StorageConfigFromEnvironment();
  if (!config) {
    return null;
  }
  return new S3StorageProvider(config);
}

async function main(): Promise<void> {
  await initializeTelemetry({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "@lobbystack/worker",
  });

  const logger = getLogger();
  const redis = createRedisConnection();
  const prefix = redisPrefix();
  const workerPool = pools.worker();
  const dispatcherPool = pools.dispatcher();
  const db = drizzle(workerPool, { schema });
  const storage = createStorageProvider();
  const handlerContext = {
    db,
    logger,
    storage,
  };
  const registry = createHandlerRegistry(handlerContext);

  const queues = Object.fromEntries(
    QUEUE_NAMES.map((queueName: QueueName) => [
      queueName,
      new Queue(queueKey(queueName), {
        connection: redis.duplicate(),
        prefix,
      }),
    ]),
  ) as Record<QueueName, Queue>;

  const workers = QUEUE_NAMES.map((queueName: QueueName) => {
    return new Worker(
      queueKey(queueName),
      async (job) => {
        const queueJob = parseQueueJob(job.data);
        const carrier = traceCarrierFromContext(queueJob.traceContext);
        const parentContext = carrier
          ? extractTraceContext(carrier)
          : otelContext.active();

        return otelContext.with(parentContext, async () =>
          withSpan(
            `job.${queueJob.jobType}`,
            async () => {
              await runHandler(registry, queueJob, {
                db,
                logger,
                storage,
              });
            },
            {
              jobId: queueJob.jobId,
              jobType: queueJob.jobType,
              queue: queueKey(queueName),
              attemptsMade: job.attemptsMade,
            },
          ),
        );
      },
      {
        connection: redis.duplicate(),
        prefix,
      },
    );
  });

  const abortController = new AbortController();
  let shuttingDown = false;

  const stopOutboxDispatcher = await startOutboxDispatcher({
    dispatcherPool,
    queues,
    logger,
    workerId: createOutboxDispatcherWorkerId(),
    signal: abortController.signal,
  });

  await registerMaintenanceSchedules(queues.maintenance);

  const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 8081);
  const healthServer = await startHealthServer(
    {
      redis,
      postgres: workerPool,
      queues,
      isShuttingDown: () => shuttingDown,
    },
    healthPort,
  );

  logger.info("Worker started", {
    healthPort,
    prefix,
    queues: QUEUE_NAMES.map((queueName: QueueName) => queueKey(queueName)),
  });

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("Worker shutting down", { signal });

    abortController.abort();
    await stopOutboxDispatcher();

    await Promise.allSettled([
      ...workers.map((worker: Worker) => worker.close()),
      ...QUEUE_NAMES.map((queueName: QueueName) => queues[queueName].close()),
      healthServer.close(),
      redis.quit(),
      closeAllPools(),
      shutdownTelemetry(),
    ]);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT").finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").finally(() => process.exit(0));
  });
}

void main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  await shutdownTelemetry();
  process.exitCode = 1;
});
