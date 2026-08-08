import {
  boolean,
  index,
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

export const calendarSchema = pgSchema("app");

export const calendarConnections = calendarSchema.table(
  "calendar_connections",
  {
    id: id(),
    businessId: businessIdColumn(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    calendarName: text("calendar_name"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    syncStatus: text("sync_status").notNull().default("active"),
    isPrimary: boolean("is_primary").notNull().default(false),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("calendar_connections_business_id_idx").on(table.businessId),
    index("calendar_connections_provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
  ],
);

export const calendarSyncEvents = calendarSchema.table(
  "calendar_sync_events",
  {
    id: id(),
    businessId: businessIdColumn(),
    connectionId: text("connection_id").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    appointmentId: text("appointment_id"),
    action: text("action").notNull(),
    status: text("status").notNull().default("pending"),
    payloadJson: jsonb("payload_json"),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("calendar_sync_events_connection_id_idx").on(table.connectionId),
    index("calendar_sync_events_business_id_idx").on(table.businessId),
  ],
);

export const externalCalendarBlocks = calendarSchema.table(
  "external_calendar_blocks",
  {
    id: id(),
    businessId: businessIdColumn(),
    connectionId: text("connection_id").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    title: text("title"),
    isBusy: boolean("is_busy").notNull().default(true),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("external_calendar_blocks_connection_id_idx").on(table.connectionId),
    index("external_calendar_blocks_business_id_idx").on(table.businessId),
    index("external_calendar_blocks_starts_at_idx").on(table.startsAt),
  ],
);
