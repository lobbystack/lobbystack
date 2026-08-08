import { randomUUID } from "node:crypto";

import type { TraceContext } from "@lobbystack/contracts";
import {
  cleanupPendingUploadJobPayloadSchema,
  traceContextSchema,
} from "@lobbystack/contracts";
import { schema, storageObjects } from "@lobbystack/db/schema";
import type { S3StorageProvider } from "@lobbystack/providers";
import {
  JOB_NAMES,
  type JobName,
  type JobPayloadFor,
  type QueueJob,
} from "@lobbystack/jobs";
import type { TelemetryLogger } from "@lobbystack/telemetry/node";
import { and, eq, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<typeof schema>;

export type HandlerContext = {
  db: Db;
  logger: TelemetryLogger;
  storage: S3StorageProvider | null;
};

export type JobHandler<T extends JobName = JobName> = (
  payload: JobPayloadFor<T>,
  context: HandlerContext,
) => Promise<void>;

export type HandlerRegistry = {
  [T in JobName]: JobHandler<T>;
};

const STUB_JOB_TYPES = new Set<JobName>([
  "email.send",
  "sms.send",
  "telemetry.flush",
  "realtime.publish",
  "snapshot.refresh",
]);

function createStubHandler(jobType: JobName): JobHandler {
  return async (payload, context) => {
    context.logger.info("Stub job handler completed", {
      jobType,
      payloadJson: JSON.stringify(payload),
    });
  };
}

async function handleCleanupPendingUpload(
  payload: JobPayloadFor<"privacy.cleanupPendingUpload">,
  context: HandlerContext,
): Promise<void> {
  const parsed = cleanupPendingUploadJobPayloadSchema.parse(payload);

  if (!context.storage) {
    throw new Error("Storage provider is not configured for pending upload cleanup");
  }

  const olderThan = parsed.olderThan
    ? new Date(parsed.olderThan)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const pendingObjects = await context.db
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.businessId, parsed.businessId),
        eq(storageObjects.status, "pending"),
        lte(storageObjects.createdAt, olderThan),
      ),
    )
    .limit(100);

  for (const object of pendingObjects) {
    await context.storage.deleteObject({ key: object.objectKey });
    await context.db
      .update(storageObjects)
      .set({
        status: "aborted",
        updatedAt: new Date(),
      })
      .where(eq(storageObjects.id, object.id));
  }

  context.logger.info("Pending upload cleanup completed", {
    businessId: parsed.businessId,
    deletedCount: pendingObjects.length,
    olderThan: olderThan.toISOString(),
  });
}

export function createHandlerRegistry(context: HandlerContext): HandlerRegistry {
  const registry = {} as HandlerRegistry;

  for (const jobType of JOB_NAMES) {
    if (jobType === "privacy.cleanupPendingUpload") {
      registry[jobType] = handleCleanupPendingUpload as JobHandler<typeof jobType>;
      continue;
    }

    if (STUB_JOB_TYPES.has(jobType)) {
      registry[jobType] = createStubHandler(jobType) as JobHandler<typeof jobType>;
      continue;
    }

    registry[jobType] = createStubHandler(jobType) as JobHandler<typeof jobType>;
  }

  return registry;
}

export function parseQueueJob(data: unknown): QueueJob {
  if (!data || typeof data !== "object") {
    throw new Error("Job payload must be an object");
  }

  const record = data as Record<string, unknown>;
  const jobType = record.jobType;
  const payload = record.payload;

  if (typeof jobType !== "string" || !JOB_NAMES.includes(jobType as JobName)) {
    throw new Error(`Unsupported job type: ${String(jobType)}`);
  }

  const jobId =
    typeof record.jobId === "string" && record.jobId.length > 0
      ? record.jobId
      : randomUUID();

  const traceContext =
    record.traceContext === undefined
      ? undefined
      : traceContextSchema.parse(record.traceContext);

  return {
    jobId,
    jobType: jobType as JobName,
    payload: payload as JobPayloadFor<JobName>,
    ...(traceContext ? { traceContext } : {}),
  };
}

export function traceCarrierFromContext(
  traceContext: TraceContext | undefined,
): Record<string, string> | undefined {
  if (!traceContext) {
    return undefined;
  }

  return {
    traceparent: traceContext.traceparent,
    ...(traceContext.tracestate ? { tracestate: traceContext.tracestate } : {}),
  };
}

export async function runHandler<T extends JobName>(
  registry: HandlerRegistry,
  job: QueueJob<T>,
  context: HandlerContext,
): Promise<void> {
  const handler = registry[job.jobType];
  if (!handler) {
    throw new Error(`No handler registered for job type ${job.jobType}`);
  }

  await (handler as JobHandler<T>)(job.payload, context);
}
