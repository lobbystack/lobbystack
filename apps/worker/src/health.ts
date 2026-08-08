import { createServer, type Server } from "node:http";

import type { HealthResponse } from "@lobbystack/contracts";
import type { QueueName } from "@lobbystack/jobs";
import { QUEUE_NAMES, queueKey } from "@lobbystack/jobs";
import type { Queue } from "bullmq";
import type Redis from "ioredis";
import type { Pool } from "pg";

const QUEUE_DEPTH_DEGRADED_THRESHOLD = 1_000;
const SERVICE_NAME = "@lobbystack/worker";

export type HealthDependencies = {
  redis: Redis;
  postgres: Pool;
  queues: Record<QueueName, Queue>;
  isShuttingDown?: () => boolean;
};

export type HealthServer = {
  server: Server;
  port: number;
  close: () => Promise<void>;
};

async function checkRedis(redis: Redis): Promise<"ok" | "failed"> {
  try {
    const response = await redis.ping();
    return response === "PONG" ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

async function checkPostgres(pool: Pool): Promise<"ok" | "failed"> {
  try {
    await pool.query("SELECT 1");
    return "ok";
  } catch {
    return "failed";
  }
}

async function checkQueueDepth(
  queue: Queue,
): Promise<"ok" | "degraded" | "failed"> {
  try {
    const counts = await queue.getJobCounts("waiting", "delayed", "paused");
    const depth =
      (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.paused ?? 0);
    if (depth >= QUEUE_DEPTH_DEGRADED_THRESHOLD) {
      return "degraded";
    }
    return "ok";
  } catch {
    return "failed";
  }
}

export async function collectHealth(
  dependencies: HealthDependencies,
): Promise<HealthResponse> {
  const queueChecks = await Promise.all(
    QUEUE_NAMES.map((queueName) => {
      const queue = dependencies.queues[queueName];
      if (!queue) {
        return Promise.resolve("failed" as const);
      }
      return checkQueueDepth(queue);
    }),
  );

  const [redis, postgres] = await Promise.all([
    checkRedis(dependencies.redis),
    checkPostgres(dependencies.postgres),
  ]);

  const checks: HealthResponse["checks"] = {
    redis,
    postgres,
  };

  for (const [index, queueName] of QUEUE_NAMES.entries()) {
    const queueStatus = queueChecks[index];
    checks[`queue_${queueName}`] = queueStatus ?? "failed";
  }

  const hasFailure = Object.values(checks).some((status) => status === "failed");
  const hasDegraded = Object.values(checks).some((status) => status === "degraded");

  return {
    status: hasFailure || hasDegraded ? "degraded" : "ok",
    service: SERVICE_NAME,
    version: process.env.GIT_SHA ?? "dev",
    checks,
  };
}

export function isReady(health: HealthResponse, shuttingDown: boolean): boolean {
  if (shuttingDown) {
    return false;
  }

  return health.checks.redis === "ok" && health.checks.postgres === "ok";
}

export async function startHealthServer(
  dependencies: HealthDependencies,
  port: number,
): Promise<HealthServer> {
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? "/", "http://worker.local").pathname;
      const shuttingDown = dependencies.isShuttingDown?.() ?? false;

      if (path === "/health/live") {
        response.writeHead(shuttingDown ? 503 : 200, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(
          JSON.stringify({
            status: shuttingDown ? "stopping" : "ok",
            service: SERVICE_NAME,
          }),
        );
        return;
      }

      if (path === "/health/ready") {
        const health = await collectHealth(dependencies);
        const ready = isReady(health, shuttingDown);
        response.writeHead(ready ? 200 : 503, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(JSON.stringify({ ...health, ready }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    })().catch((error: unknown) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const boundPort =
    typeof address === "object" && address ? address.port : port;

  return {
    server,
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export function queueNamesForHealth(): string[] {
  return QUEUE_NAMES.map((queueName) => queueKey(queueName));
}
