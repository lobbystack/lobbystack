import { customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const legacyId = {
  legacyConvexId: text("legacy_convex_id"),
};

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    const raw = String(value).replace(/^\[/, "").replace(/\]$/, "");
    return raw.length === 0 ? [] : raw.split(",").map(Number);
  },
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    phone: text("phone"),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    passwordAlgorithm: varchar("password_algorithm", { length: 32 }),
    platformRole: varchar("platform_role", { length: 32 }).default("operator").notNull(),
    activeBusinessId: uuid("active_business_id"),
    preferredLocale: varchar("preferred_locale", { length: 8 }).default("en").notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_normalized_email_unique").on(table.normalizedEmail),
    uniqueIndex("users_legacy_convex_id_unique").on(table.legacyConvexId),
    index("users_phone_idx").on(table.phone),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId),
    index("accounts_user_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [uniqueIndex("sessions_token_unique").on(table.token), index("sessions_user_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    defaultLocale: varchar("default_locale", { length: 8 }).default("en").notNull(),
    businessType: varchar("business_type", { length: 64 }).notNull(),
    deploymentMode: varchar("deployment_mode", { length: 32 }).default("cloud").notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    websiteUrl: text("website_url"),
    onboardingStage: varchar("onboarding_stage", { length: 64 }).default("create_business").notNull(),
    onboardingAttribution: varchar("onboarding_attribution", { length: 120 }),
    setupGuideSkippedSteps: jsonb("setup_guide_skipped_steps").$type<string[]>().default([]).notNull(),
    phoneNumberReplacementReservedAt: timestamp("phone_number_replacement_reserved_at", { withTimezone: true }),
    phoneNumberReplacementUsedAt: timestamp("phone_number_replacement_used_at", { withTimezone: true }),
    telemetryEnabled: boolean("telemetry_enabled").default(true).notNull(),
    // Who set the opening hours: none yet, AI from the knowledge sources, or a person.
    hoursSource: varchar("hours_source", { length: 16 }).$type<"none" | "generated" | "operator">().default("none").notNull(),
    hoursFingerprint: varchar("hours_fingerprint", { length: 64 }),
    hoursGeneratedAt: timestamp("hours_generated_at", { withTimezone: true }),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("businesses_slug_unique").on(table.slug),
    uniqueIndex("businesses_legacy_convex_id_unique").on(table.legacyConvexId),
  ],
);

export const businessMemberships = pgTable(
  "business_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("business_memberships_business_user_unique").on(table.businessId, table.userId),
    index("business_memberships_business_idx").on(table.businessId),
    index("business_memberships_user_idx").on(table.userId),
  ],
);

export const businessInvitations = pgTable(
  "business_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    invitedByUserId: uuid("invited_by_user_id").notNull().references(() => users.id),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("business_invitations_token_hash_unique").on(table.tokenHash),
    index("business_invitations_business_status_idx").on(table.businessId, table.status),
    index("business_invitations_email_idx").on(table.normalizedEmail),
  ],
);

export const prospectDemos = pgTable(
  "prospect_demos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: varchar("status", { length: 32 }).default("preparing").notNull(),
    locale: varchar("locale", { length: 8 }).default("en").notNull(),
    suggestedPrompts: jsonb("suggested_prompts").$type<string[]>().default([]).notNull(),
    recipientEmail: text("recipient_email"),
    recipientName: text("recipient_name"),
    campaignId: text("campaign_id"),
    websiteUrl: text("website_url").notNull(),
    businessName: text("business_name").notNull(),
    operatorUserId: uuid("operator_user_id").notNull().references(() => users.id),
    websiteIngestionJobId: uuid("website_ingestion_job_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedByUserId: uuid("claimed_by_user_id").references(() => users.id),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("prospect_demos_token_hash_unique").on(table.tokenHash),
    uniqueIndex("prospect_demos_business_unique").on(table.businessId),
    index("prospect_demos_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    active: boolean("active").default(true).notNull(),
    transferNumber: text("transfer_number"),
    ...legacyId,
    ...timestamps,
  },
  (table) => [index("staff_business_active_idx").on(table.businessId, table.active)],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    localizedNames: jsonb("localized_names").$type<Record<string, string>>(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    active: boolean("active").default(true).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("services_business_slug_live_unique").on(table.businessId, table.slug).where(sql`${table.deletedAt} is null`), index("services_business_idx").on(table.businessId)],
);

export const staffServiceAssignments = pgTable(
  "staff_service_assignments",
  {
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.staffId, table.serviceId] }), index("assignments_business_idx").on(table.businessId)],
);

export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    openMinutes: integer("open_minutes").notNull(),
    closeMinutes: integer("close_minutes").notNull(),
    ...timestamps,
  },
  // A day can have several windows, such as a morning and an afternoon around a lunch break.
  (table) => [uniqueIndex("business_hours_business_day_open_unique").on(table.businessId, table.dayOfWeek, table.openMinutes)],
);

export const closures = pgTable(
  "closures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    ...timestamps,
  },
  (table) => [index("closures_business_starts_idx").on(table.businessId, table.startsAt)],
);

export const phoneNumbers = pgTable(
  "phone_numbers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    e164: varchar("e164", { length: 32 }).notNull(),
    providerPhoneId: varchar("provider_phone_id", { length: 255 }),
    voiceEnabled: boolean("voice_enabled").default(true).notNull(),
    smsEnabled: boolean("sms_enabled").default(true).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    reclaimScheduledAt: timestamp("reclaim_scheduled_at", { withTimezone: true }),
    reclaimReason: varchar("reclaim_reason", { length: 64 }),
    voiceWebhookStatus: varchar("voice_webhook_status", { length: 32 }),
    voiceWebhookTargetUrl: text("voice_webhook_target_url"),
    voiceWebhookLastSyncedAt: timestamp("voice_webhook_last_synced_at", { withTimezone: true }),
    voiceWebhookLastError: text("voice_webhook_last_error"),
    smsWebhookStatus: varchar("sms_webhook_status", { length: 32 }),
    smsWebhookTargetUrl: text("sms_webhook_target_url"),
    smsWebhookLastSyncedAt: timestamp("sms_webhook_last_synced_at", { withTimezone: true }),
    smsWebhookLastError: text("sms_webhook_last_error"),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("phone_numbers_e164_unique").on(table.e164),
    uniqueIndex("phone_numbers_provider_id_unique").on(table.providerPhoneId),
    index("phone_numbers_business_idx").on(table.businessId),
  ],
);

export const onboardingPhoneVerifications = pgTable("onboarding_phone_verifications", {
  id: uuid("id").defaultRandom().primaryKey(), businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), phoneE164: varchar("phone_e164", { length: 32 }).notNull(), countryCode: varchar("country_code", { length: 2 }).notNull(), lineType: varchar("line_type", { length: 32 }), providerVerificationId: varchar("provider_verification_id", { length: 255 }), status: varchar("status", { length: 32 }).default("queued").notNull(), startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), approvedAt: timestamp("approved_at", { withTimezone: true }), attemptCount: integer("attempt_count").default(0).notNull(), lastError: text("last_error"), requestFingerprint: text("request_fingerprint").notNull(), codeHash: text("code_hash"), ...timestamps,
}, (table) => [index("onboarding_phone_verifications_business_user_idx").on(table.businessId, table.userId, table.updatedAt), index("onboarding_phone_verifications_provider_idx").on(table.providerVerificationId), index("onboarding_phone_verifications_user_phone_status_idx").on(table.userId, table.phoneE164, table.status, table.updatedAt)]);

export const onboardingNumberClaimEvents = pgTable("onboarding_number_claim_events", {
  id: uuid("id").defaultRandom().primaryKey(), businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), purpose: varchar("purpose", { length: 32 }).default("onboarding").notNull(), replacingPhoneNumberId: uuid("replacing_phone_number_id").references(() => phoneNumbers.id, { onDelete: "set null" }), requestedE164: varchar("requested_e164", { length: 32 }).notNull(), selectionContext: jsonb("selection_context").$type<Record<string, unknown>>().notNull(), claimTokenHash: text("claim_token_hash").notNull(), idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(), status: varchar("status", { length: 32 }).default("reserved").notNull(), phoneNumberId: uuid("phone_number_id").references(() => phoneNumbers.id, { onDelete: "set null" }), providerPhoneId: varchar("provider_phone_id", { length: 255 }), reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(), purchasedAt: timestamp("purchased_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), attemptCount: integer("attempt_count").default(0).notNull(), lastError: text("last_error"), alternatives: jsonb("alternatives").$type<Array<Record<string, unknown>>>(), ...timestamps,
}, (table) => [uniqueIndex("onboarding_number_claim_events_business_key_unique").on(table.businessId, table.idempotencyKey), uniqueIndex("onboarding_number_claim_events_provider_unique").on(table.providerPhoneId), index("onboarding_number_claim_events_user_purchased_idx").on(table.userId, table.purchasedAt), index("onboarding_number_claim_events_business_status_idx").on(table.businessId, table.status, table.reservedAt)]);

export const receptionistProfiles = pgTable(
  "receptionist_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    greeting: text("greeting").notNull(),
    tone: text("tone").notNull(),
    summary: text("summary").notNull(),
    // Who wrote the summary: "placeholder" (sign-up default), "generated" (AI,
    // from the knowledge sources) or "operator". Generation never replaces an
    // operator's summary.
    summarySource: varchar("summary_source", { length: 16 }).$type<"placeholder" | "generated" | "operator">().default("placeholder").notNull(),
    summaryFingerprint: varchar("summary_fingerprint", { length: 64 }),
    summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
    bookingPolicy: text("booking_policy").notNull(),
    voiceInstructions: text("voice_instructions"),
    smsInstructions: text("sms_instructions"),
    chatInstructions: text("chat_instructions"),
    transferMode: varchar("transfer_mode", { length: 32 }).notNull(),
    transferNumber: text("transfer_number"),
    appointmentChangePolicy: jsonb("appointment_change_policy").$type<Record<string, unknown>>(),
    bookingMode: varchar("booking_mode", { length: 16 }).default("instant").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("receptionist_profiles_business_unique").on(table.businessId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name"),
    phone: varchar("phone", { length: 32 }),
    email: text("email"),
    timezone: varchar("timezone", { length: 80 }),
    preferredLocale: varchar("preferred_locale", { length: 8 }),
    smsConsentStatus: varchar("sms_consent_status", { length: 32 }),
    smsConsentUpdatedAt: timestamp("sms_consent_updated_at", { withTimezone: true }),
    smsConsentSource: varchar("sms_consent_source", { length: 64 }),
    // The status a STOP to the shared sender replaced, which START restores.
    smsConsentStatusBeforeOptOut: varchar("sms_consent_status_before_opt_out", { length: 32 }),
    operatorBlockedAt: timestamp("operator_blocked_at", { withTimezone: true }),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("contacts_business_phone_unique").on(table.businessId, table.phone).where(sql`${table.phone} is not null`), index("contacts_business_email_idx").on(table.businessId, table.email)],
);

export const widgetKeys = pgTable(
  "widget_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    label: varchar("label", { length: 120 }),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("widget_keys_key_hash_unique").on(table.keyHash),
    index("widget_keys_business_created_idx").on(table.businessId, table.createdAt),
  ],
);

export const widgetVisitors = pgTable(
  "widget_visitors",
  {
    id: uuid("id").primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    // When the visitor was last linked to a contact. Deleting the contact clears
    // contact_id but not this, so a later link only takes chats that started after it.
    contactLinkedAt: timestamp("contact_linked_at", { withTimezone: true }),
    name: text("name"),
    email: text("email"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    index("widget_visitors_business_last_seen_idx").on(table.businessId, table.lastSeenAt),
    index("widget_visitors_contact_idx").on(table.businessId, table.contactId),
  ],
);

export const smsConsentEvents = pgTable(
  "sms_consent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    phone: varchar("phone", { length: 32 }).notNull(),
    recipientType: varchar("recipient_type", { length: 16 }).default("contact").notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    source: varchar("source", { length: 160 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("sms_consent_events_legacy_convex_id_unique").on(table.legacyConvexId), index("sms_consent_events_business_idx").on(table.businessId, table.occurredAt), index("sms_consent_events_phone_idx").on(table.phone, table.occurredAt)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    widgetVisitorId: uuid("widget_visitor_id").references(() => widgetVisitors.id, { onDelete: "set null" }),
    channel: varchar("channel", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).default("open").notNull(),
    automationState: varchar("automation_state", { length: 32 }).default("ai_active").notNull(),
    automationPausedAt: timestamp("automation_paused_at", { withTimezone: true }),
    automationPausedByUserId: uuid("automation_paused_by_user_id").references(() => users.id, { onDelete: "set null" }),
    summary: text("summary"),
    currentIntent: text("current_intent"),
    locale: varchar("locale", { length: 8 }),
    revision: integer("revision").default(0).notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [index("conversations_business_status_idx").on(table.businessId, table.status), index("conversations_contact_idx").on(table.businessId, table.contactId), index("conversations_business_widget_visitor_idx").on(table.businessId, table.widgetVisitorId)],
);

export const conversationSessions = pgTable(
  "conversation_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    callId: uuid("call_id"),
    channel: varchar("channel", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).default("open").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
    summaryKind: varchar("summary_kind", { length: 32 }),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [index("conversation_sessions_conversation_idx").on(table.conversationId, table.startedAt), uniqueIndex("conversation_sessions_call_unique").on(table.callId).where(sql`${table.callId} is not null`)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    conversationSessionId: uuid("conversation_session_id").references(() => conversationSessions.id, { onDelete: "set null" }),
    direction: varchar("direction", { length: 16 }).notNull(),
    channel: varchar("channel", { length: 32 }).notNull(),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
    providerPrice: doublePrecision("provider_price"),
    providerPriceUnit: varchar("provider_price_unit", { length: 16 }),
    providerCostUsd: doublePrecision("provider_cost_usd"),
    providerNumSegments: integer("provider_num_segments"),
    body: text("body").notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    providerStatus: varchar("provider_status", { length: 64 }),
    senderRole: varchar("sender_role", { length: 32 }),
    aiGenerated: boolean("ai_generated").default(false).notNull(),
    media: jsonb("media").$type<Array<Record<string, unknown>>>(),
    revision: integer("revision").default(0).notNull(),
    contentExpiresAt: timestamp("content_expires_at", { withTimezone: true }),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("messages_provider_id_unique").on(table.providerMessageId),
    index("messages_business_idx").on(table.businessId, table.createdAt),
    index("messages_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 32 }).default("twilio").notNull(),
    providerCallId: varchar("provider_call_id", { length: 255 }).notNull(),
    gatewaySessionId: varchar("gateway_session_id", { length: 255 }),
    transport: varchar("transport", { length: 32 }).notNull(),
    originUrl: text("origin_url"),
    userAgent: text("user_agent"),
    widgetId: varchar("widget_id", { length: 128 }),
    sessionPurpose: varchar("session_purpose", { length: 32 }),
    prospectDemoId: uuid("prospect_demo_id").references(() => prospectDemos.id, { onDelete: "set null" }),
    webCallMaxDurationMs: integer("web_call_max_duration_ms"),
    status: varchar("status", { length: 32 }).default("started").notNull(),
    billingExcluded: boolean("billing_excluded").default(false).notNull(),
    transferState: varchar("transfer_state", { length: 32 }),
    disposition: varchar("disposition", { length: 120 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    mediaStartedAt: timestamp("media_started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    providerDurationSeconds: integer("provider_duration_seconds"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
    providerPrice: doublePrecision("provider_price"),
    providerPriceUnit: varchar("provider_price_unit", { length: 16 }),
    providerCostUsd: doublePrecision("provider_cost_usd"),
    recordingObjectId: uuid("recording_object_id"),
    revision: integer("revision").default(0).notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("calls_provider_call_unique").on(table.provider, table.providerCallId),
    uniqueIndex("calls_gateway_session_unique").on(table.gatewaySessionId),
    index("calls_business_started_idx").on(table.businessId, table.startedAt),
    index("calls_business_recording_idx").on(table.businessId, table.recordingObjectId).where(sql`${table.recordingObjectId} is not null`),
    index("calls_open_live_started_idx").on(table.startedAt).where(sql`${table.endedAt} is null and ${table.provider} = 'openai_live'`),
  ],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    relatedCallId: uuid("related_call_id").references(() => calls.id, { onDelete: "set null" }),
    status: varchar("status", { length: 32 }).default("open").notNull(),
    contentRetentionStatus: varchar("content_retention_status", { length: 32 }).default("active").notNull(),
    contentExpiresAt: timestamp("content_expires_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inbox_items_legacy_convex_id_unique").on(table.legacyConvexId),
    index("inbox_items_business_status_idx").on(table.businessId, table.status),
    index("inbox_items_business_kind_status_idx").on(table.businessId, table.kind, table.status),
    index("inbox_items_related_call_idx").on(table.relatedCallId),
  ],
);

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    callId: uuid("call_id").notNull().references(() => calls.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    speaker: varchar("speaker", { length: 32 }).notNull(),
    text: text("text").notNull(),
    confidence: integer("confidence"),
    final: boolean("final").default(false).notNull(),
    revision: integer("revision").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("transcripts_call_sequence_unique").on(table.callId, table.sequence)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    staffId: uuid("staff_id").notNull().references(() => staff.id),
    serviceId: uuid("service_id").notNull().references(() => services.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    status: varchar("status", { length: 32 }).default("confirmed").notNull(),
    sourceChannel: varchar("source_channel", { length: 32 }).notNull(),
    calendarSyncState: varchar("calendar_sync_state", { length: 32 }).default("not_required").notNull(),
    calendarExternalId: text("calendar_external_id"),
    revision: integer("revision").default(0).notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    index("appointments_business_start_idx").on(table.businessId, table.startsAt),
    index("appointments_staff_start_idx").on(table.staffId, table.startsAt),
    index("appointments_business_created_idx").on(table.businessId, table.createdAt),
    uniqueIndex("appointments_calendar_external_unique").on(table.businessId, table.calendarExternalId),
  ],
);

export const appointmentChangeVerifications = pgTable(
  "appointment_change_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    callerPhone: varchar("caller_phone", { length: 32 }).notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    codeHash: text("code_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    ...timestamps,
  },
  (table) => [index("appointment_verifications_appointment_idx").on(table.appointmentId), index("appointment_verifications_business_idx").on(table.businessId)],
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    title: text("title").notNull(),
    active: boolean("active").default(true).notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    sourceUrl: text("source_url"),
    storageObjectId: uuid("storage_object_id"),
    mimeType: varchar("mime_type", { length: 255 }),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    processingProgress: integer("processing_progress").default(0).notNull(),
    contentHash: varchar("content_hash", { length: 128 }),
    error: text("error"),
    revision: integer("revision").default(0).notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [index("knowledge_documents_business_status_idx").on(table.businessId, table.status), index("knowledge_documents_hash_idx").on(table.businessId, table.contentHash), uniqueIndex("knowledge_documents_business_url_unique").on(table.businessId, table.sourceUrl), index("knowledge_documents_title_keyword_idx").using("gin", sql`to_tsvector('simple', ${table.title})`)],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    embedding: vector("embedding"),
    embeddingFingerprint: varchar("embedding_fingerprint", { length: 64 }),
    embeddingStatus: varchar("embedding_status", { length: 16 }).default("pending").notNull(),
    embeddingError: text("embedding_error"),
    tokenCount: integer("token_count"),
    ...timestamps,
  },
  (table) => [uniqueIndex("knowledge_chunks_document_sequence_unique").on(table.documentId, table.sequence), index("knowledge_chunks_business_embedding_fingerprint_idx").on(table.businessId, table.embeddingFingerprint), index("knowledge_chunks_keyword_idx").using("gin", sql`to_tsvector('simple', ${table.content})`)],
);

export const knowledgeSnippets = pgTable(
  "knowledge_snippets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    priority: integer("priority").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [index("knowledge_snippets_business_active_idx").on(table.businessId, table.active)],
);

export const agentRules = pgTable(
  "agent_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [index("agent_rules_business_order_idx").on(table.businessId, table.sortOrder)],
);

export const websiteIngestionJobs = pgTable(
  "website_ingestion_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    rootDocumentId: uuid("root_document_id").references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    websiteUrl: text("website_url").notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    importedCount: integer("imported_count").default(0).notNull(),
    indexedCount: integer("indexed_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    /** The cap the crawl ran with, so a sample stays distinguishable from a full read. */
    pageLimit: integer("page_limit"),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [index("website_jobs_business_status_idx").on(table.businessId, table.status), uniqueIndex("website_jobs_root_document_idx").on(table.rootDocumentId)],
);

export const businessContextSnapshots = pgTable(
  "business_context_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 64 }).notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("context_snapshots_business_version_unique").on(table.businessId, table.version), index("context_snapshots_business_generated_idx").on(table.businessId, table.generatedAt)],
);

export const storageObjects = pgTable(
  "storage_objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    fileName: text("file_name").notNull(),
    contentType: varchar("content_type", { length: 255 }).notNull(),
    contentLength: integer("content_length"),
    checksum: text("checksum"),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("storage_objects_key_unique").on(table.objectKey),
    index("storage_objects_business_status_idx").on(table.businessId, table.status),
    index("storage_objects_business_retention_idx").on(table.businessId, table.retentionUntil).where(sql`${table.retentionUntil} is not null and ${table.purpose} <> 'recording'`),
    index("storage_objects_recording_retention_idx").on(table.businessId, table.retentionUntil, table.id).where(sql`${table.purpose} = 'recording' and ${table.status} = 'ready' and ${table.retentionUntil} is not null`),
  ],
);

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    externalAccountId: text("external_account_id").notNull(),
    selectedCalendarId: text("selected_calendar_id"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    syncCursor: text("sync_cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    status: varchar("status", { length: 32 }).default("connected").notNull(),
    lastSyncError: text("last_sync_error"),
    ...timestamps,
  },
  (table) => [uniqueIndex("calendar_connections_business_provider_account_unique").on(table.businessId, table.provider, table.externalAccountId), index("calendar_connections_business_idx").on(table.businessId, table.status)],
);

export const calendarBusyBlocks = pgTable(
  "calendar_busy_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => calendarConnections.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    externalEventId: text("external_event_id"),
    ...timestamps,
  },
  (table) => [uniqueIndex("calendar_busy_blocks_external_unique").on(table.connectionId, table.externalEventId), index("calendar_busy_blocks_staff_idx").on(table.staffId, table.startsAt), index("calendar_busy_blocks_connection_start_idx").on(table.connectionId, table.startsAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 32 }).notNull(),
    kind: varchar("kind", { length: 64 }).notNull(),
    relatedId: uuid("related_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    providerMessageId: text("provider_message_id"),
    providerPrice: doublePrecision("provider_price"),
    providerPriceUnit: varchar("provider_price_unit", { length: 16 }),
    providerCostUsd: doublePrecision("provider_cost_usd"),
    providerNumSegments: integer("provider_num_segments"),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("notifications_event_unique").on(table.businessId, table.kind, table.relatedId), uniqueIndex("notifications_legacy_convex_id_unique").on(table.legacyConvexId), index("notifications_status_schedule_idx").on(table.status, table.scheduledFor)],
);

export const operatorNotificationPreferences = pgTable(
  "operator_notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").default(true).notNull(),
    smsEnabled: boolean("sms_enabled").default(false).notNull(),
    eventPreferences: jsonb("event_preferences").$type<Record<string, { email: boolean; sms: boolean }>>().notNull(),
    dailySummaryEnabled: boolean("daily_summary_enabled").default(false).notNull(),
    dailySummarySendTime: varchar("daily_summary_send_time", { length: 5 }),
    smsConsentGrantedAt: timestamp("sms_consent_granted_at", { withTimezone: true }),
    smsConsentRevokedAt: timestamp("sms_consent_revoked_at", { withTimezone: true }),
    smsConsentSource: varchar("sms_consent_source", { length: 64 }),
    smsConsentDisclosureVersion: varchar("sms_consent_disclosure_version", { length: 64 }),
    smsConsentPhone: varchar("sms_consent_phone", { length: 32 }),
    ...timestamps,
  },
  (table) => [uniqueIndex("operator_notification_preferences_business_user_unique").on(table.businessId, table.userId), index("operator_notification_preferences_user_idx").on(table.userId, table.businessId)],
);

export const operatorNotificationDeliveries = pgTable(
  "operator_notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventKind: varchar("event_kind", { length: 64 }).notNull(),
    eventKey: varchar("event_key", { length: 255 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    destination: text("destination").notNull(),
    sender: text("sender"), subject: text("subject").notNull(), body: text("body").notNull(), providerMessageId: text("provider_message_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).defaultNow().notNull(), sentAt: timestamp("sent_at", { withTimezone: true }),
    contentExpiresAt: timestamp("content_expires_at", { withTimezone: true }).notNull(), lastError: text("last_error"), providerPrice: doublePrecision("provider_price"), providerPriceUnit: varchar("provider_price_unit", { length: 16 }), providerCostUsd: doublePrecision("provider_cost_usd"), providerNumSegments: integer("provider_num_segments"), ...legacyId, ...timestamps,
  },
  (table) => [uniqueIndex("operator_notification_deliveries_event_channel_unique").on(table.eventKey, table.userId, table.channel), uniqueIndex("operator_notification_deliveries_legacy_convex_id_unique").on(table.legacyConvexId), index("operator_notification_deliveries_status_schedule_idx").on(table.status, table.scheduledFor), index("operator_notification_deliveries_business_user_idx").on(table.businessId, table.userId)],
);

export const billingAccounts = pgTable(
  "billing_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 32 }).default("polar").notNull(),
    billingKey: text("billing_key").notNull(),
    customerId: text("customer_id"),
    subscriptionId: text("subscription_id"),
    plan: varchar("plan", { length: 64 }),
    billingInterval: varchar("billing_interval", { length: 16 }),
    subscriptionState: varchar("subscription_state", { length: 32 }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    overageSpendingCapCents: integer("overage_spending_cap_cents"),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("billing_accounts_business_unique").on(table.businessId), uniqueIndex("billing_accounts_billing_key_unique").on(table.billingKey), uniqueIndex("billing_accounts_legacy_convex_id_unique").on(table.legacyConvexId), index("billing_accounts_customer_idx").on(table.customerId)],
);

export const billingCheckoutRequests = pgTable(
  "billing_checkout_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    target: varchar("target", { length: 32 }).notNull(),
    billingInterval: varchar("billing_interval", { length: 16 }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    checkoutId: text("checkout_id"),
    checkoutUrl: text("checkout_url"),
    error: text("error"),
    ...timestamps,
  },
  (table) => [uniqueIndex("billing_checkout_requests_id_unique").on(table.id), index("billing_checkout_requests_business_status_idx").on(table.businessId, table.status, table.createdAt)],
);

export const billingTransactions = pgTable(
  "billing_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    sourceId: text("source_id").notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    refundedAmountCents: integer("refunded_amount_cents").default(0).notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    description: text("description"),
    invoiceUrl: text("invoice_url"),
    orderId: text("order_id"),
    subscriptionId: text("subscription_id"),
    polarCustomerId: text("polar_customer_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("billing_transactions_kind_source_unique").on(table.kind, table.sourceId), index("billing_transactions_business_occurred_idx").on(table.businessId, table.occurredAt)],
);

export const billingUsageEvents = pgTable(
  "billing_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    periodKey: varchar("period_key", { length: 16 }).notNull(),
    sourceKey: varchar("source_key", { length: 255 }).notNull(),
    usageKind: varchar("usage_kind", { length: 64 }).notNull(),
    quantity: doublePrecision("quantity").notNull(),
    billableQuantity: doublePrecision("billable_quantity"),
    planAtRecordTime: varchar("plan_at_record_time", { length: 32 }),
    billingIntervalAtRecordTime: varchar("billing_interval_at_record_time", { length: 16 }),
    isFinal: boolean("is_final").default(true).notNull(),
    ...legacyId,
    syncStatus: varchar("sync_status", { length: 32 }).default("pending").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("billing_usage_source_unique").on(table.businessId, table.sourceKey), index("billing_usage_status_idx").on(table.syncStatus, table.createdAt)],
);

export const billingUsageMonths = pgTable(
  "billing_usage_months",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    periodKey: varchar("period_key", { length: 16 }).notNull(),
    planAtSnapshot: varchar("plan_at_snapshot", { length: 32 }),
    voiceSecondsUsed: doublePrecision("voice_seconds_used").default(0).notNull(),
    alertSmsSegmentsUsed: doublePrecision("alert_sms_segments_used").default(0).notNull(),
    outboundCallAttemptsUsed: doublePrecision("outbound_call_attempts_used").default(0).notNull(),
    chatAiTokensUsed: doublePrecision("chat_ai_tokens_used").default(0).notNull(),
    voiceBlocked: boolean("voice_blocked").default(false).notNull(),
    alertSmsBlocked: boolean("alert_sms_blocked").default(false).notNull(),
    outboundCallAttemptsBlocked: boolean("outbound_call_attempts_blocked").default(false).notNull(),
    chatAiBlocked: boolean("chat_ai_tokens_blocked").default(false).notNull(),
    overageSpendCents: integer("overage_spend_cents").default(0).notNull(),
    lastRecordedAt: timestamp("last_recorded_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("billing_usage_months_business_period_unique").on(table.businessId, table.periodKey), index("billing_usage_months_business_idx").on(table.businessId, table.lastRecordedAt)],
);

export const complianceRecords = pgTable(
  "compliance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    providerReference: text("provider_reference"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [uniqueIndex("compliance_records_business_kind_unique").on(table.businessId, table.kind)],
);

export const feedbackSubmissions = pgTable(
  "feedback_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    userEmail: text("user_email"),
    userName: text("user_name"),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    businessName: text("business_name"),
    message: text("message").notNull(),
    pagePath: text("page_path"),
    userAgent: text("user_agent"),
    emailStatus: varchar("email_status", { length: 32 }).default("pending_email").notNull(),
    recipientEmail: text("recipient_email"),
    providerMessageId: text("provider_message_id"),
    emailError: text("email_error"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("feedback_submissions_legacy_convex_id_unique").on(table.legacyConvexId), index("feedback_submissions_business_submitted_idx").on(table.businessId, table.submittedAt), index("feedback_submissions_user_submitted_idx").on(table.userId, table.submittedAt), index("feedback_submissions_status_submitted_idx").on(table.emailStatus, table.submittedAt)],
);

export const affiliateProfiles = pgTable(
  "affiliate_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    referralCode: varchar("referral_code", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    payoutEmail: text("payout_email"),
    ...timestamps,
  },
  (table) => [uniqueIndex("affiliate_profiles_user_unique").on(table.userId), uniqueIndex("affiliate_profiles_code_unique").on(table.referralCode)],
);

export const affiliateAttributions = pgTable(
  "affiliate_attributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateProfileId: uuid("affiliate_profile_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    referredUserId: uuid("referred_user_id").notNull().references(() => users.id),
    referralCode: varchar("referral_code", { length: 64 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    attributedAt: timestamp("attributed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("affiliate_attributions_business_unique").on(table.businessId), index("affiliate_attributions_profile_idx").on(table.affiliateProfileId, table.createdAt)],
);

export const affiliateProfileStats = pgTable(
  "affiliate_profile_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateProfileId: uuid("affiliate_profile_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
    clickCount: integer("click_count").default(0).notNull(),
    referralCount: integer("referral_count").default(0).notNull(),
    conversionCount: integer("conversion_count").default(0).notNull(),
    pendingCommissionCents: integer("pending_commission_cents").default(0).notNull(),
    paidCommissionCents: integer("paid_commission_cents").default(0).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("affiliate_profile_stats_profile_unique").on(table.affiliateProfileId)],
);

export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateProfileId: uuid("affiliate_profile_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
    referralCode: varchar("referral_code", { length: 64 }).notNull(),
    visitorId: text("visitor_id"),
    sourceUrl: text("source_url"),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [index("affiliate_clicks_profile_clicked_idx").on(table.affiliateProfileId, table.clickedAt), index("affiliate_clicks_code_clicked_idx").on(table.referralCode, table.clickedAt)],
);

export const affiliateVoidedSources = pgTable(
  "affiliate_voided_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceKey: varchar("source_key", { length: 255 }).notNull(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    billingTransactionId: uuid("billing_transaction_id").notNull().references(() => billingTransactions.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("affiliate_voided_sources_key_unique").on(table.sourceKey), index("affiliate_voided_sources_business_idx").on(table.businessId)],
);

export const affiliatePayoutRuns = pgTable(
  "affiliate_payout_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    periodKey: varchar("period_key", { length: 16 }).notNull(),
    status: varchar("status", { length: 32 }).default("draft").notNull(),
    totalCents: integer("total_cents").default(0).notNull(),
    currency: varchar("currency", { length: 8 }).default("usd").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (table) => [uniqueIndex("affiliate_payout_runs_period_unique").on(table.periodKey), index("affiliate_payout_runs_status_created_idx").on(table.status, table.createdAt)],
);

export const affiliatePayoutItems = pgTable(
  "affiliate_payout_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payoutRunId: uuid("payout_run_id").notNull().references(() => affiliatePayoutRuns.id, { onDelete: "cascade" }),
    affiliateProfileId: uuid("affiliate_profile_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    status: varchar("status", { length: 32 }).default("draft").notNull(),
    payoutEmail: text("payout_email").notNull(),
    affiliateEmail: text("affiliate_email"),
    affiliateName: text("affiliate_name"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    externalReference: text("external_reference"),
    note: text("note"),
    ...timestamps,
  },
  (table) => [uniqueIndex("affiliate_payout_items_run_profile_unique").on(table.payoutRunId, table.affiliateProfileId), index("affiliate_payout_items_profile_created_idx").on(table.affiliateProfileId, table.createdAt), index("affiliate_payout_items_run_status_idx").on(table.payoutRunId, table.status)],
);

export const affiliateCommissions = pgTable(
  "affiliate_commissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateProfileId: uuid("affiliate_profile_id").notNull().references(() => affiliateProfiles.id, { onDelete: "cascade" }),
    referredBusinessId: uuid("referred_business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    sourceKey: varchar("source_key", { length: 255 }).notNull(),
    billingTransactionId: uuid("billing_transaction_id").notNull().references(() => billingTransactions.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    payoutState: varchar("payout_state", { length: 32 }).default("unassigned").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    clearsAt: timestamp("clears_at", { withTimezone: true }).notNull(),
    payoutItemId: uuid("payout_item_id"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: varchar("void_reason", { length: 64 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("affiliate_commissions_source_unique").on(table.sourceKey), index("affiliate_commissions_profile_status_idx").on(table.affiliateProfileId, table.status), index("affiliate_commissions_status_clears_idx").on(table.status, table.payoutState, table.clearsAt), index("affiliate_commissions_business_idx").on(table.referredBusinessId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: uuid("entity_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("audit_logs_legacy_convex_id_unique").on(table.legacyConvexId), index("audit_logs_business_created_idx").on(table.businessId, table.createdAt), index("audit_logs_entity_idx").on(table.entityType, table.entityId)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: varchar("scope", { length: 120 }).notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).default("processing").notNull(),
    resourceType: varchar("resource_type", { length: 120 }),
    resourceId: uuid("resource_id"),
    response: jsonb("response").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [uniqueIndex("idempotency_scope_key_unique").on(table.scope, table.key), index("idempotency_business_idx").on(table.businessId)],
);

export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 160 }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 32 }).default("received").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("provider_events_provider_id_unique").on(table.provider, table.providerEventId), index("provider_events_business_idx").on(table.businessId, table.createdAt)],
);

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topic: varchar("topic", { length: 160 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    aggregateType: varchar("aggregate_type", { length: 120 }).notNull(),
    aggregateId: uuid("aggregate_id"),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 255 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    lastError: text("last_error"),
    traceparent: text("traceparent"),
    tracestate: text("tracestate"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("outbox_dedupe_key_unique").on(table.dedupeKey),
    index("outbox_available_idx").on(table.publishedAt, table.availableAt),
    index("outbox_dead_letter_idx").on(table.deadLetteredAt, table.createdAt),
    index("outbox_business_idx").on(table.businessId),
  ],
);

export const productEvents = pgTable(
  "product_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    distinctId: varchar("distinct_id", { length: 255 }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("product_events_pending_idx").on(table.sentAt, table.occurredAt),
    index("product_events_business_idx").on(table.businessId, table.occurredAt),
  ],
);

export const unitEconomicsEvents = pgTable(
  "unit_economics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    monthKey: varchar("month_key", { length: 16 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    eventKey: varchar("event_key", { length: 255 }).notNull(),
    eventKind: varchar("event_kind", { length: 64 }).notNull(),
    channel: varchar("channel", { length: 32 }).notNull(),
    costUsd: doublePrecision("cost_usd"),
    quantity: doublePrecision("quantity"),
    quantityUnit: varchar("quantity_unit", { length: 32 }),
    provider: varchar("provider", { length: 64 }),
    model: varchar("model", { length: 160 }),
    operation: varchar("operation", { length: 160 }),
    pricingVersion: varchar("pricing_version", { length: 64 }),
    pricingSource: varchar("pricing_source", { length: 500 }),
    pricingEffectiveDate: varchar("pricing_effective_date", { length: 10 }),
    pricingRates: jsonb("pricing_rates").$type<Record<string, number>>(),
    tokenUsage: jsonb("token_usage").$type<Record<string, number>>(),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "set null" }),
    operatorNotificationDeliveryId: uuid("operator_notification_delivery_id").references(() => operatorNotificationDeliveries.id, { onDelete: "set null" }),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("unit_economics_events_business_event_key_unique").on(table.businessId, table.eventKey), uniqueIndex("unit_economics_events_legacy_convex_id_unique").on(table.legacyConvexId), index("unit_economics_events_business_month_idx").on(table.businessId, table.monthKey, table.occurredAt), index("unit_economics_events_kind_idx").on(table.businessId, table.eventKind, table.occurredAt)],
);

export const unitEconomicsRollups = pgTable(
  "unit_economics_rollups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    monthKey: varchar("month_key", { length: 16 }).notNull(),
    totalCostUsd: doublePrecision("total_cost_usd").default(0).notNull(),
    providerCostUsd: doublePrecision("provider_cost_usd").default(0).notNull(),
    aiCostUsd: doublePrecision("ai_cost_usd").default(0).notNull(),
    infraCostUsd: doublePrecision("infra_cost_usd").default(0).notNull(),
    voiceCostUsd: doublePrecision("voice_cost_usd").default(0).notNull(),
    smsCostUsd: doublePrecision("sms_cost_usd").default(0).notNull(),
    alertSmsCostUsd: doublePrecision("alert_sms_cost_usd").default(0).notNull(),
    voiceCallCount: integer("voice_call_count").default(0).notNull(),
    voiceMinutes: doublePrecision("voice_minutes").default(0).notNull(),
    outboundSmsCount: integer("outbound_sms_count").default(0).notNull(),
    smsThreadCount: integer("sms_thread_count").default(0).notNull(),
    activeUserCount: integer("active_user_count").default(0).notNull(),
    costPerVoiceCallUsd: doublePrecision("cost_per_voice_call_usd").default(0).notNull(),
    costPerVoiceMinuteUsd: doublePrecision("cost_per_voice_minute_usd").default(0).notNull(),
    costPerOutboundSmsUsd: doublePrecision("cost_per_outbound_sms_usd").default(0).notNull(),
    costPerSmsThreadUsd: doublePrecision("cost_per_sms_thread_usd").default(0).notNull(),
    costPerActiveUserUsd: doublePrecision("cost_per_active_user_usd").default(0).notNull(),
    costPerBusinessUsd: doublePrecision("cost_per_business_usd").default(0).notNull(),
    recomputedAt: timestamp("recomputed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("unit_economics_rollups_business_month_unique").on(table.businessId, table.monthKey), index("unit_economics_rollups_month_idx").on(table.monthKey)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    prefix: varchar("prefix", { length: 32 }).notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    uniqueIndex("api_keys_prefix_unique").on(table.prefix),
    index("api_keys_business_created_idx").on(table.businessId, table.createdAt),
  ],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: varchar("description", { length: 200 }),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    encryptedSecret: text("encrypted_secret").notNull(),
    status: varchar("status", { length: 16 }).default("enabled").notNull(),
    disabledReason: varchar("disabled_reason", { length: 16 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByApiKeyId: uuid("created_by_api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("webhook_endpoints_business_status_idx").on(table.businessId, table.status)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("webhook_events_business_created_idx").on(table.businessId, table.createdAt)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => webhookEvents.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastResponseStatus: integer("last_response_status"),
    lastError: text("last_error"),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("webhook_deliveries_endpoint_created_idx").on(table.endpointId, table.createdAt),
    index("webhook_deliveries_business_created_idx").on(table.businessId, table.createdAt),
    index("webhook_deliveries_event_idx").on(table.eventId),
  ],
);

export const webhookDeliveryAttempts = pgTable(
  "webhook_delivery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id").notNull().references(() => webhookDeliveries.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    responseStatus: integer("response_status"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("webhook_delivery_attempts_delivery_number_unique").on(table.deliveryId, table.attemptNumber),
    index("webhook_delivery_attempts_business_created_idx").on(table.businessId, table.createdAt),
  ],
);

// OAuth 2.1 for MCP clients, owned by Better Auth's oauth-provider plugin and
// written with the lobbystack_auth role. Property names are the plugin's field
// names. A grant is an oauth_consents row: one client, one user, one business
// (reference_id holds the business id).
const oauthId = { id: text("id").primaryKey().default(sql`gen_random_uuid()::text`) };

export const oauthClients = pgTable(
  "oauth_clients",
  {
    ...oauthId,
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes").array().default(sql`'{}'::text[]`),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (table) => [uniqueIndex("oauth_clients_client_id_unique").on(table.clientId), index("oauth_clients_user_idx").on(table.userId)],
);

export const oauthResources = pgTable(
  "oauth_resources",
  {
    ...oauthId,
    identifier: text("identifier").notNull(),
    name: text("name").notNull(),
    accessTokenTtl: integer("access_token_ttl"),
    refreshTokenTtl: integer("refresh_token_ttl"),
    signingAlgorithm: text("signing_algorithm"),
    signingKeyId: text("signing_key_id"),
    allowedScopes: text("allowed_scopes").array(),
    customClaims: jsonb("custom_claims"),
    dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
    disabled: boolean("disabled").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    policyVersion: integer("policy_version").default(1),
    metadata: jsonb("metadata"),
  },
  (table) => [uniqueIndex("oauth_resources_identifier_unique").on(table.identifier)],
);

export const oauthClientResources = pgTable(
  "oauth_client_resources",
  {
    ...oauthId,
    clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => oauthResources.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("oauth_client_resources_unique").on(table.clientId, table.resourceId), index("oauth_client_resources_resource_idx").on(table.resourceId)],
);

export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    ...oauthId,
    token: text("token").notNull(),
    clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    revoked: timestamp("revoked", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", { withTimezone: true }),
    authTime: timestamp("auth_time", { withTimezone: true }),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    uniqueIndex("oauth_refresh_tokens_token_unique").on(table.token),
    index("oauth_refresh_tokens_grant_idx").on(table.clientId, table.userId, table.referenceId),
    index("oauth_refresh_tokens_session_idx").on(table.sessionId),
    index("oauth_refresh_tokens_code_idx").on(table.authorizationCodeId),
  ],
);

export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    ...oauthId,
    token: text("token"),
    clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id").references(() => oauthRefreshTokens.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    revoked: timestamp("revoked", { withTimezone: true }),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    uniqueIndex("oauth_access_tokens_token_unique").on(table.token),
    index("oauth_access_tokens_grant_idx").on(table.clientId, table.userId, table.referenceId),
    index("oauth_access_tokens_refresh_idx").on(table.refreshId),
    index("oauth_access_tokens_session_idx").on(table.sessionId),
    index("oauth_access_tokens_code_idx").on(table.authorizationCodeId),
  ],
);

export const oauthConsents = pgTable(
  "oauth_consents",
  {
    ...oauthId,
    clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    // LobbyStack's own column: when the grant last made an MCP request.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [index("oauth_consents_grant_idx").on(table.clientId, table.userId, table.referenceId), index("oauth_consents_reference_idx").on(table.referenceId)],
);

export const oauthClientAssertions = pgTable("oauth_client_assertions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const allTenantTables = [
  businesses,
  businessMemberships,
  businessInvitations,
  prospectDemos,
  staff,
  services,
  staffServiceAssignments,
  businessHours,
  closures,
  phoneNumbers,
  onboardingPhoneVerifications,
  onboardingNumberClaimEvents,
  receptionistProfiles,
  contacts,
  widgetKeys,
  widgetVisitors,
  smsConsentEvents,
  conversations,
  conversationSessions,
  messages,
  calls,
  transcripts,
  appointments,
  appointmentChangeVerifications,
  knowledgeDocuments,
  knowledgeChunks,
  knowledgeSnippets,
  agentRules,
  websiteIngestionJobs,
  businessContextSnapshots,
  storageObjects,
  calendarConnections,
  calendarBusyBlocks,
  notifications,
  operatorNotificationPreferences,
  operatorNotificationDeliveries,
  billingAccounts,
  billingCheckoutRequests,
  billingTransactions,
  billingUsageEvents,
  billingUsageMonths,
  complianceRecords,
  feedbackSubmissions,
  affiliateAttributions,
  affiliateVoidedSources,
  affiliateCommissions,
  auditLogs,
  idempotencyKeys,
  providerEvents,
  outboxMessages,
  productEvents,
  unitEconomicsEvents,
  unitEconomicsRollups,
  apiKeys,
  webhookEndpoints,
  webhookEvents,
  webhookDeliveries,
  webhookDeliveryAttempts,
] as const;

export const schema = {
  users,
  accounts,
  sessions,
  verifications,
  businesses,
  businessMemberships,
  businessInvitations,
  prospectDemos,
  staff,
  services,
  staffServiceAssignments,
  businessHours,
  closures,
  phoneNumbers,
  onboardingPhoneVerifications,
  onboardingNumberClaimEvents,
  receptionistProfiles,
  contacts,
  widgetKeys,
  widgetVisitors,
  smsConsentEvents,
  conversations,
  conversationSessions,
  messages,
  calls,
  transcripts,
  appointments,
  appointmentChangeVerifications,
  knowledgeDocuments,
  knowledgeChunks,
  knowledgeSnippets,
  agentRules,
  websiteIngestionJobs,
  businessContextSnapshots,
  storageObjects,
  calendarConnections,
  calendarBusyBlocks,
  notifications,
  operatorNotificationPreferences,
  operatorNotificationDeliveries,
  billingAccounts,
  billingCheckoutRequests,
  billingTransactions,
  billingUsageEvents,
  billingUsageMonths,
  complianceRecords,
  feedbackSubmissions,
  affiliateProfiles,
  affiliateAttributions,
  affiliateProfileStats,
  affiliateClicks,
  affiliateVoidedSources,
  affiliatePayoutRuns,
  affiliatePayoutItems,
  affiliateCommissions,
  auditLogs,
  idempotencyKeys,
  providerEvents,
  outboxMessages,
  productEvents,
  unitEconomicsEvents,
  unitEconomicsRollups,
  apiKeys,
  webhookEndpoints,
  webhookEvents,
  webhookDeliveries,
  webhookDeliveryAttempts,
  oauthClients,
  oauthResources,
  oauthClientResources,
  oauthRefreshTokens,
  oauthAccessTokens,
  oauthConsents,
  oauthClientAssertions,
};

export type Schema = typeof schema;
