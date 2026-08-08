import {
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

export const complianceSchema = pgSchema("app");

export const smsComplianceProfiles = complianceSchema.table(
  "sms_compliance_profiles",
  {
    id: id(),
    businessId: businessIdColumn(),
    status: text("status").notNull().default("draft"),
    brandKind: text("brand_kind"),
    customerType: text("customer_type"),
    trafficTier: text("traffic_tier"),
    draftJson: jsonb("draft_json"),
    submissionSnapshotJson: jsonb("submission_snapshot_json"),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "date",
    }),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    rejectedAt: timestamp("rejected_at", {
      withTimezone: true,
      mode: "date",
    }),
    rejectionReason: text("rejection_reason"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("sms_compliance_profiles_business_id_idx").on(table.businessId),
  ],
);

export const smsConsentStates = complianceSchema.table(
  "sms_consent_states",
  {
    id: id(),
    businessId: businessIdColumn(),
    contactId: text("contact_id"),
    phoneE164: text("phone_e164").notNull(),
    recipientType: text("recipient_type").notNull(),
    scope: text("scope").notNull(),
    status: text("status").notNull(),
    source: text("source"),
    evidenceJson: jsonb("evidence_json"),
    consentedAt: timestamp("consented_at", {
      withTimezone: true,
      mode: "date",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("sms_consent_states_business_id_idx").on(table.businessId),
    index("sms_consent_states_phone_e164_idx").on(table.phoneE164),
  ],
);

export const smsConsentEvents = complianceSchema.table(
  "sms_consent_events",
  {
    id: id(),
    businessId: businessIdColumn(),
    consentStateId: text("consent_state_id").notNull(),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorUserId: text("actor_user_id"),
    payloadJson: jsonb("payload_json"),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("sms_consent_events_consent_state_id_idx").on(table.consentStateId),
    index("sms_consent_events_business_id_idx").on(table.businessId),
  ],
);

export const dataRetentionPolicies = complianceSchema.table(
  "data_retention_policies",
  {
    id: id(),
    businessId: businessIdColumn(),
    resourceType: text("resource_type").notNull(),
    retentionDays: text("retention_days").notNull(),
    status: text("status").notNull().default("active"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("data_retention_policies_business_id_idx").on(table.businessId),
  ],
);
