import {
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  businessIdColumn,
  id,
  legacyConvexId,
  timestamps,
} from "./_common";

export const operationsSchema = pgSchema("app");

export const outboxMessages = operationsSchema.table(
  "outbox_messages",
  {
    id: id(),
    businessId: businessIdColumn(),
    topic: text("topic").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    status: text("status").notNull().default("pending"),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lockedBy: text("locked_by"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    dedupeKey: text("dedupe_key"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("outbox_messages_status_available_at_idx").on(
      table.status,
      table.availableAt,
    ),
    index("outbox_messages_business_id_idx").on(table.businessId),
    uniqueIndex("outbox_messages_dedupe_key_idx").on(table.dedupeKey),
  ],
);

export const workflowJobs = operationsSchema.table(
  "workflow_jobs",
  {
    id: id(),
    businessId: businessIdColumn(),
    workflowType: text("workflow_type").notNull(),
    status: text("status").notNull().default("queued"),
    inputJson: jsonb("input_json").notNull(),
    outputJson: jsonb("output_json"),
    errorMessage: text("error_message"),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    attempts: integer("attempts").notNull().default(0),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("workflow_jobs_business_id_idx").on(table.businessId),
    index("workflow_jobs_status_scheduled_at_idx").on(
      table.status,
      table.scheduledAt,
    ),
  ],
);

export const auditLogs = operationsSchema.table(
  "audit_logs",
  {
    id: id(),
    businessId: businessIdColumn(),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    action: text("action").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("audit_logs_business_id_idx").on(table.businessId),
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export const storageObjects = operationsSchema.table(
  "storage_objects",
  {
    id: id(),
    businessId: businessIdColumn(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type"),
    byteLength: integer("byte_length"),
    checksum: text("checksum"),
    status: text("status").notNull().default("active"),
    retentionStatus: text("retention_status").notNull().default("active"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("storage_objects_bucket_object_key_idx").on(
      table.bucket,
      table.objectKey,
    ),
    index("storage_objects_business_id_idx").on(table.businessId),
  ],
);

export const idempotencyKeys = operationsSchema.table(
  "idempotency_keys",
  {
    id: id(),
    businessId: businessIdColumn(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash"),
    responseJson: jsonb("response_json"),
    status: text("status").notNull().default("in_progress"),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_business_scope_key_idx").on(
      table.businessId,
      table.scope,
      table.key,
    ),
  ],
);
