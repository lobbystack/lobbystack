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

export const notificationsSchema = pgSchema("app");

export const notificationPreferences = notificationsSchema.table(
  "notification_preferences",
  {
    id: id(),
    businessId: businessIdColumn(),
    userId: text("user_id").notNull(),
    channel: text("channel").notNull(),
    eventKind: text("event_kind").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    settingsJson: jsonb("settings_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("notification_preferences_business_user_idx").on(
      table.businessId,
      table.userId,
    ),
  ],
);

export const notificationDeliveries = notificationsSchema.table(
  "notification_deliveries",
  {
    id: id(),
    businessId: businessIdColumn(),
    userId: text("user_id"),
    channel: text("channel").notNull(),
    eventKind: text("event_kind").notNull(),
    status: text("status").notNull().default("pending"),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    body: text("body"),
    providerMessageId: text("provider_message_id"),
    payloadJson: jsonb("payload_json"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    errorMessage: text("error_message"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("notification_deliveries_business_id_idx").on(table.businessId),
    index("notification_deliveries_status_idx").on(table.status),
  ],
);

export const pushSubscriptions = notificationsSchema.table(
  "push_subscriptions",
  {
    id: id(),
    businessId: businessIdColumn(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("push_subscriptions_user_id_idx").on(table.userId),
    index("push_subscriptions_business_id_idx").on(table.businessId),
  ],
);
