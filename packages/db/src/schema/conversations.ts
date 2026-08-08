import {
  boolean,
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

export const conversationsSchema = pgSchema("app");

export const contacts = conversationsSchema.table(
  "contacts",
  {
    id: id(),
    businessId: businessIdColumn(),
    displayName: text("display_name"),
    phoneE164: text("phone_e164"),
    email: text("email"),
    notes: text("notes"),
    tagsJson: jsonb("tags_json"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("contacts_business_id_idx").on(table.businessId),
    index("contacts_phone_e164_idx").on(table.phoneE164),
    index("contacts_email_idx").on(table.email),
  ],
);

export const conversations = conversationsSchema.table(
  "conversations",
  {
    id: id(),
    businessId: businessIdColumn(),
    contactId: text("contact_id"),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("open"),
    subject: text("subject"),
    assignedUserId: text("assigned_user_id"),
    lastMessageAt: timestamp("last_message_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("conversations_business_id_idx").on(table.businessId),
    index("conversations_contact_id_idx").on(table.contactId),
    index("conversations_last_message_at_idx").on(table.lastMessageAt),
  ],
);

export const messages = conversationsSchema.table(
  "messages",
  {
    id: id(),
    businessId: businessIdColumn(),
    conversationId: text("conversation_id").notNull(),
    direction: text("direction").notNull(),
    senderRole: text("sender_role").notNull(),
    body: text("body"),
    mediaJson: jsonb("media_json"),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull().default("sent"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    deliveredAt: timestamp("delivered_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_business_id_idx").on(table.businessId),
    index("messages_provider_message_id_idx").on(table.providerMessageId),
  ],
);

export const conversationSessions = conversationsSchema.table(
  "conversation_sessions",
  {
    id: id(),
    businessId: businessIdColumn(),
    conversationId: text("conversation_id").notNull(),
    callId: text("call_id"),
    kind: text("kind").notNull(),
    summaryJson: jsonb("summary_json"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    messageCount: integer("message_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("conversation_sessions_conversation_id_idx").on(
      table.conversationId,
    ),
    index("conversation_sessions_business_id_idx").on(table.businessId),
  ],
);
