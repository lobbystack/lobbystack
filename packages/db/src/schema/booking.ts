import {
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import {
  businessIdColumn,
  id,
  legacyConvexId,
  timestamps,
} from "./_common";

export const bookingSchema = pgSchema("app");

export const appointments = bookingSchema.table(
  "appointments",
  {
    id: id(),
    businessId: businessIdColumn(),
    contactId: text("contact_id"),
    serviceId: text("service_id"),
    staffId: text("staff_id"),
    conversationId: text("conversation_id"),
    callId: text("call_id"),
    status: text("status").notNull().default("scheduled"),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    timezone: text("timezone").notNull(),
    notes: text("notes"),
    cancellationReason: text("cancellation_reason"),
    source: text("source").notNull().default("voice"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("appointments_business_id_idx").on(table.businessId),
    index("appointments_starts_at_idx").on(table.startsAt),
    index("appointments_contact_id_idx").on(table.contactId),
  ],
);

export const appointmentVerifications = bookingSchema.table(
  "appointment_verifications",
  {
    id: id(),
    businessId: businessIdColumn(),
    appointmentId: text("appointment_id").notNull(),
    channel: text("channel").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    attempts: integer("attempts").notNull().default(0),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("appointment_verifications_appointment_id_idx").on(
      table.appointmentId,
    ),
    index("appointment_verifications_business_id_idx").on(table.businessId),
  ],
);

export const appointmentAuditLogs = bookingSchema.table(
  "appointment_audit_logs",
  {
    id: id(),
    businessId: businessIdColumn(),
    appointmentId: text("appointment_id").notNull(),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    reason: text("reason"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("appointment_audit_logs_appointment_id_idx").on(table.appointmentId),
    index("appointment_audit_logs_business_id_idx").on(table.businessId),
  ],
);
