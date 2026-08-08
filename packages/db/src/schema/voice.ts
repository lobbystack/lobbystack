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

export const voiceSchema = pgSchema("app");

export const calls = voiceSchema.table(
  "calls",
  {
    id: id(),
    businessId: businessIdColumn(),
    conversationId: text("conversation_id"),
    contactId: text("contact_id"),
    phoneNumberId: text("phone_number_id"),
    direction: text("direction").notNull(),
    status: text("status").notNull().default("ringing"),
    fromE164: text("from_e164").notNull(),
    toE164: text("to_e164").notNull(),
    provider: text("provider").notNull().default("twilio"),
    providerCallSid: text("provider_call_sid"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    answeredAt: timestamp("answered_at", {
      withTimezone: true,
      mode: "date",
    }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    durationSeconds: integer("duration_seconds"),
    disposition: text("disposition"),
    recordingUrl: text("recording_url"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("calls_business_id_idx").on(table.businessId),
    index("calls_provider_call_sid_idx").on(table.providerCallSid),
    index("calls_conversation_id_idx").on(table.conversationId),
  ],
);

export const callTranscripts = voiceSchema.table(
  "call_transcripts",
  {
    id: id(),
    businessId: businessIdColumn(),
    callId: text("call_id").notNull(),
    speaker: text("speaker").notNull(),
    text: text("text").notNull(),
    sequence: integer("sequence").notNull(),
    spokenAt: timestamp("spoken_at", { withTimezone: true, mode: "date" }),
    confidence: integer("confidence"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("call_transcripts_call_id_idx").on(table.callId),
    index("call_transcripts_business_id_idx").on(table.businessId),
  ],
);

export const callEvents = voiceSchema.table(
  "call_events",
  {
    id: id(),
    businessId: businessIdColumn(),
    callId: text("call_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: jsonb("payload_json"),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("call_events_call_id_idx").on(table.callId),
    index("call_events_business_id_idx").on(table.businessId),
  ],
);
