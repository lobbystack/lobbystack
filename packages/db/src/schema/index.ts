import { customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
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

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
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

// A company that resells LobbyStack under its own brand. Its slug is also its
// subdomain's label under the partner base domain.
export const partners = pgTable(
  "partners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 40 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // The partner's brand (migration 0131). Each image's version changes with its bytes.
    logo: bytea("logo"),
    logoContentType: varchar("logo_content_type", { length: 32 }),
    logoVersion: text("logo_version").generatedAlwaysAs(sql`encode(sha256(logo), 'hex')`),
    favicon: bytea("favicon"),
    faviconContentType: varchar("favicon_content_type", { length: 32 }),
    faviconVersion: text("favicon_version").generatedAlwaysAs(sql`encode(sha256(favicon), 'hex')`),
    brandColor: varchar("brand_color", { length: 7 }),
    termsUrl: text("terms_url"),
    privacyUrl: text("privacy_url"),
    supportUrl: text("support_url"),
    supportEmail: varchar("support_email", { length: 254 }),
    // When the partner's one 14-day trial number started, kept after the business that held it is deleted (migration 0154).
    numberTrialStartedAt: timestamp("number_trial_started_at", { withTimezone: true }),
    // Whether the console shares product telemetry, as a business's telemetryEnabled does for its dashboard (migration 0160).
    telemetryEnabled: boolean("telemetry_enabled").default(true).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("partners_slug_unique").on(table.slug)],
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
    /** ISO 4217 code every service price is in. */
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
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
    // The partner that resells this business, or null for a direct business. A direct business never gets one.
    partnerId: uuid("partner_id").references(() => partners.id),
    // What a partner's business lets its own operators do: full, or activity only. Direct businesses ignore it, and only the system actor changes it.
    partnerAccessLevel: varchar("partner_access_level", { length: 16 }).$type<"full" | "activity">().default("full").notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("businesses_slug_unique").on(table.slug),
    uniqueIndex("businesses_legacy_convex_id_unique").on(table.legacyConvexId),
    index("businesses_partner_idx").on(table.partnerId).where(sql`${table.partnerId} is not null`),
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
    index("business_memberships_user_idx").on(table.userId),
  ],
);

export const businessInvitations = pgTable(
  "business_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    // Null when a partner's platform key invited them as the partner; a claim link always names its sender.
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
    invitedByPlatformKeyId: uuid("invited_by_platform_key_id"),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // A claim link: accepting it makes the invitee an owner and takes the inviter off the team.
    transfersOwnership: boolean("transfers_ownership").default(false).notNull(),
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

export const partnerMembers = pgTable(
  "partner_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).$type<"owner" | "admin" | "member">().notNull(),
    status: varchar("status", { length: 16 }).$type<"active" | "removed">().default("active").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("partner_members_partner_user_unique").on(table.partnerId, table.userId),
    index("partner_members_user_idx").on(table.userId).where(sql`${table.status} = 'active'`),
  ],
);

export const partnerInvitations = pgTable(
  "partner_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    // A person, or a partner's platform key that invited as the partner (migration 0162).
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "cascade" }),
    invitedByPlatformKeyId: uuid("invited_by_platform_key_id").references(() => partnerPlatformKeys.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    role: varchar("role", { length: 16 }).$type<"owner" | "admin" | "member">().notNull(),
    tokenHash: text("token_hash").notNull(),
    status: varchar("status", { length: 16 }).$type<"pending" | "accepted" | "revoked">().default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("partner_invitations_token_hash_unique").on(table.tokenHash),
    index("partner_invitations_partner_status_idx").on(table.partnerId, table.status),
  ],
);

// The hostnames a partner's brand answers on: its subdomain of the partner base domain, and later its own domains.
export const partnerDomains = pgTable(
  "partner_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    hostname: varchar("hostname", { length: 253 }).notNull(),
    kind: varchar("kind", { length: 16 }).$type<"subdomain" | "custom">().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // A partner's own domain: the provider that set it up, its id there, and what the provider last said.
    provider: varchar("provider", { length: 16 }).$type<"cloudflare" | "caddy">(),
    providerHostnameId: text("provider_hostname_id"),
    dnsRecords: jsonb("dns_records").$type<Array<{ type: "CNAME" | "TXT"; name: string; value: string; verified: boolean }>>().notNull().default([]),
    providerErrors: jsonb("provider_errors").$type<string[]>().notNull().default([]),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    addedByUserId: uuid("added_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // The value a partner's own domain publishes as a TXT record to prove the partner controls it.
    verificationToken: varchar("verification_token", { length: 64 }).notNull().default(sql`replace(gen_random_uuid()::text, '-', '')`),
    ...timestamps,
  },
  (table) => [
    // Partners' claims on the same domain of their own wait side by side until one is verified.
    uniqueIndex("partner_domains_verified_hostname_unique").on(table.hostname).where(sql`${table.verifiedAt} IS NOT NULL OR ${table.kind} = 'subdomain'`),
    index("partner_domains_hostname_idx").on(table.hostname),
    uniqueIndex("partner_domains_one_subdomain").on(table.partnerId).where(sql`${table.kind} = 'subdomain'`),
    uniqueIndex("partner_domains_one_custom").on(table.partnerId).where(sql`${table.kind} = 'custom'`),
    index("partner_domains_pending_custom_idx").on(table.checkedAt).where(sql`${table.kind} = 'custom' AND ${table.verifiedAt} IS NULL AND ${table.failedAt} IS NULL`),
  ],
);

// The business a person last worked in on each partner's domains. The host's own domain keeps users.activeBusinessId.
export const userActiveBusinesses = pgTable(
  "user_active_businesses",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.partnerId] }),
    index("user_active_businesses_business_idx").on(table.businessId),
  ],
);

// A partner member's open of one of the partner's businesses (migration 0136): until it expires, they work inside the
// business without joining its team. Opening again moves the times forward; the business's audit log keeps every open.
export const partnerBusinessOpens = pgTable(
  "partner_business_opens",
  {
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.businessId, table.userId] }),
    index("partner_business_opens_user_idx").on(table.userId, table.expiresAt),
  ],
);

// The platform keys a partner made in its console. Each acts as the partner and keeps only its key's SHA-256.
export const partnerPlatformKeys = pgTable(
  "partner_platform_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    prefix: varchar("prefix", { length: 12 }).notNull(),
    keyHash: text("key_hash").notNull(),
    // Always "group": a CHECK refuses "all", which would reach every business on the deployment.
    access: varchar("access", { length: 16 }).$type<"group">().default("group").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Who last changed the key's name or scopes (migration 0166).
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // The owner who granted its partner.billing scopes, which count only while they're an active owner. Null when it has none.
    billingScopesGrantedByUserId: uuid("billing_scopes_granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("partner_platform_keys_prefix_unique").on(table.prefix),
    uniqueIndex("partner_platform_keys_key_hash_unique").on(table.keyHash),
    index("partner_platform_keys_partner_created_idx").on(table.partnerId, table.createdAt),
  ],
);

// A partner's templates (migration 0148): a business's setup in the lobbystack onboard file format, which the
// partner starts new businesses from. Saved once, never changed.
export const businessTemplates = pgTable(
  "business_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("business_templates_partner_idx").on(table.partnerId, table.createdAt),
    uniqueIndex("business_templates_id_partner_unique").on(table.id, table.partnerId),
  ],
);

// The stored copy of each document a template lists. Its partner is the template's, as a key on both keeps it.
export const businessTemplateFiles = pgTable(
  "business_template_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id").notNull(),
    partnerId: uuid("partner_id").notNull(),
    path: text("path").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: varchar("content_type", { length: 255 }).notNull(),
    contentLength: integer("content_length").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.templateId, table.partnerId], foreignColumns: [businessTemplates.id, businessTemplates.partnerId] }).onDelete("cascade"),
    uniqueIndex("business_template_files_path_unique").on(table.templateId, table.path),
    uniqueIndex("business_template_files_object_key_unique").on(table.objectKey),
  ],
);

// The host's invitations to sign up as a partner while signup is invite-only.
export const partnerSignupInvitations = pgTable(
  "partner_signup_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: varchar("status", { length: 16 }).$type<"pending" | "accepted" | "revoked">().default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("partner_signup_invitations_token_hash_unique").on(table.tokenHash)],
);

// A partner's connected Stripe account (migration 0141), as the Connect webhook last described it.
export const partnerStripeAccounts = pgTable(
  "partner_stripe_accounts",
  {
    partnerId: uuid("partner_id").primaryKey().references(() => partners.id, { onDelete: "cascade" }),
    stripeAccountId: varchar("stripe_account_id", { length: 255 }).notNull(),
    country: varchar("country", { length: 2 }),
    // The account's default currency, uppercase: its packages are priced in it.
    currency: varchar("currency", { length: 3 }),
    detailsSubmitted: boolean("details_submitted").default(false).notNull(),
    chargesEnabled: boolean("charges_enabled").default(false).notNull(),
    payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
    disabledReason: varchar("disabled_reason", { length: 120 }),
    // Set when the partner disconnects the account in Stripe. Connecting again makes a new account.
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    // When Stripe last described the account, so late news never overwrites newer news.
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("partner_stripe_accounts_account_unique").on(table.stripeAccountId)],
);

// What a partner sells its businesses (migration 0141): a monthly price, an
// optional setup fee and an allowance, with the product and prices on the
// connected account named here. Only the name and archivedAt change.
export const partnerPackages = pgTable(
  "partner_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    monthlyPriceMinor: integer("monthly_price_minor").notNull(),
    setupFeeMinor: integer("setup_fee_minor"),
    voiceMinutes: integer("voice_minutes").notNull(),
    chats: integer("chats").notNull(),
    stripeAccountId: varchar("stripe_account_id", { length: 255 }).notNull(),
    stripeProductId: varchar("stripe_product_id", { length: 255 }).notNull(),
    stripePriceId: varchar("stripe_price_id", { length: 255 }).notNull(),
    stripeSetupPriceId: varchar("stripe_setup_price_id", { length: 255 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [index("partner_packages_partner_idx").on(table.partnerId, table.createdAt)],
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
    // The host's operator, or the partner's member who made it. Null for a demo a partner's platform key made (migration 0162).
    operatorUserId: uuid("operator_user_id").references(() => users.id),
    createdByPlatformKeyId: uuid("created_by_platform_key_id"),
    websiteIngestionJobId: uuid("website_ingestion_job_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedByUserId: uuid("claimed_by_user_id").references(() => users.id),
    // The partner whose team made the demo, or null for the host's own.
    partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("prospect_demos_token_hash_unique").on(table.tokenHash),
    uniqueIndex("prospect_demos_business_unique").on(table.businessId),
    index("prospect_demos_status_expires_idx").on(table.status, table.expiresAt),
    index("prospect_demos_partner_idx").on(table.partnerId, table.createdAt).where(sql`${table.partnerId} is not null`),
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
    // Listed on the Employees page. The default staff member that stands for the business is not one.
    isEmployee: boolean("is_employee").default(false).notNull(),
    ...legacyId,
    ...timestamps,
  },
  (table) => [
    index("staff_business_active_idx").on(table.businessId, table.active),
    uniqueIndex("staff_employee_phone_unique").on(table.businessId, table.transferNumber).where(sql`${table.isEmployee} and ${table.active} and ${table.transferNumber} is not null`),
  ],
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
    /** In the business currency's smallest unit; null when no price is set. The lower bound for a range. */
    priceMinor: bigint("price_minor", { mode: "number" }),
    priceMaxMinor: bigint("price_max_minor", { mode: "number" }),
    priceType: varchar("price_type", { length: 16 }).$type<"fixed" | "from" | "range" | "in_person">().default("fixed").notNull(),
    /** Percent off every amount, 0 for none; up to two decimals. */
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2, mode: "number" }).default(0).notNull(),
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
    // A staff member's own working hours; null for the business's. Staff without rows work the business's hours.
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    openMinutes: integer("open_minutes").notNull(),
    closeMinutes: integer("close_minutes").notNull(),
    ...timestamps,
  },
  // A day can have several windows, such as a morning and an afternoon around a lunch break.
  (table) => [
    uniqueIndex("business_hours_business_day_open_unique").on(table.businessId, table.dayOfWeek, table.openMinutes).where(sql`${table.staffId} is null`),
    uniqueIndex("business_hours_staff_day_open_unique").on(table.staffId, table.dayOfWeek, table.openMinutes).where(sql`${table.staffId} is not null`),
  ],
);

export const closures = pgTable(
  "closures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    // A staff member's time off; null for a closure of the whole business.
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "cascade" }),
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
    uniqueIndex("phone_numbers_e164_unreclaimed_unique").on(table.e164).where(sql`${table.status} <> 'reclaimed'`),
    uniqueIndex("phone_numbers_provider_id_unique").on(table.providerPhoneId),
    index("phone_numbers_business_idx").on(table.businessId),
  ],
);

export const onboardingPhoneVerifications = pgTable("onboarding_phone_verifications", {
  id: uuid("id").defaultRandom().primaryKey(), businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), phoneE164: varchar("phone_e164", { length: 32 }).notNull(), countryCode: varchar("country_code", { length: 2 }).notNull(), lineType: varchar("line_type", { length: 32 }), providerVerificationId: varchar("provider_verification_id", { length: 255 }), status: varchar("status", { length: 32 }).default("queued").notNull(), startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), approvedAt: timestamp("approved_at", { withTimezone: true }), attemptCount: integer("attempt_count").default(0).notNull(), lastError: text("last_error"), requestFingerprint: text("request_fingerprint").notNull(), codeHash: text("code_hash"), ...timestamps,
}, (table) => [index("onboarding_phone_verifications_business_user_idx").on(table.businessId, table.userId, table.updatedAt), index("onboarding_phone_verifications_provider_idx").on(table.providerVerificationId), index("onboarding_phone_verifications_user_phone_status_idx").on(table.userId, table.phoneE164, table.status, table.updatedAt)]);

export const onboardingNumberClaimEvents = pgTable("onboarding_number_claim_events", {
  id: uuid("id").defaultRandom().primaryKey(), businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), purpose: varchar("purpose", { length: 32 }).default("onboarding").notNull(), replacingPhoneNumberId: uuid("replacing_phone_number_id").references(() => phoneNumbers.id, { onDelete: "set null" }), requestedE164: varchar("requested_e164", { length: 32 }).notNull(), selectionContext: jsonb("selection_context").$type<Record<string, unknown>>().notNull(), claimTokenHash: text("claim_token_hash").notNull(), idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(), status: varchar("status", { length: 32 }).default("reserved").notNull(), phoneNumberId: uuid("phone_number_id").references(() => phoneNumbers.id, { onDelete: "set null" }), providerPhoneId: varchar("provider_phone_id", { length: 255 }), reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(), purchasedAt: timestamp("purchased_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), attemptCount: integer("attempt_count").default(0).notNull(), lastError: text("last_error"), alternatives: jsonb("alternatives").$type<Array<Record<string, unknown>>>(),
  // A partner member made the claim through an open of the business, so only the partner's quotas count it (migration 0159).
  byPartnerMember: boolean("by_partner_member").default(false).notNull(), ...timestamps,
}, (table) => [uniqueIndex("onboarding_number_claim_events_business_key_unique").on(table.businessId, table.idempotencyKey), uniqueIndex("onboarding_number_claim_events_provider_unique").on(table.providerPhoneId), index("onboarding_number_claim_events_user_purchased_idx").on(table.userId, table.purchasedAt), index("onboarding_number_claim_events_business_status_idx").on(table.businessId, table.status, table.reservedAt)]);

export const numberTrials = pgTable("number_trials", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  claimId: uuid("claim_id").references(() => onboardingNumberClaimEvents.id, { onDelete: "set null" }),
  phoneNumberId: uuid("phone_number_id").references(() => phoneNumbers.id, { onDelete: "set null" }),
  verifiedPhone: varchar("verified_phone", { length: 32 }).notNull(),
  ipHash: text("ip_hash"),
  status: varchar("status", { length: 16 }).default("reserved").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  minutesExhaustedAt: timestamp("minutes_exhausted_at", { withTimezone: true }),
  emailsSent: jsonb("emails_sent").$type<Record<string, string>>().default({}).notNull(),
  // The partner whose one trial this is, set from the business as it's reserved (migration 0154).
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("number_trials_business_unique").on(table.businessId).where(sql`${table.status} <> 'failed'`),
  uniqueIndex("number_trials_partner_unique").on(table.partnerId).where(sql`${table.partnerId} is not null and ${table.status} <> 'failed'`),
  index("number_trials_phone_idx").on(table.verifiedPhone),
  index("number_trials_user_idx").on(table.userId),
  index("number_trials_ip_created_idx").on(table.ipHash, table.createdAt),
  index("number_trials_claim_idx").on(table.claimId),
]);

export const numberWaitlist = pgTable("number_waitlist", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("number_waitlist_business_country_unique").on(table.businessId, table.countryCode)]);

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
    // The outcome of the last "Rewrite with AI"; null when none was asked for.
    summaryRegenerateStatus: varchar("summary_regenerate_status", { length: 16 }).$type<"pending" | "completed" | "empty" | "failed">(),
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
    // When the opt-in confirmation went out for the current yes to texts. Null until it does.
    smsOptInConfirmedAt: timestamp("sms_opt_in_confirmed_at", { withTimezone: true }),
    operatorBlockedAt: timestamp("operator_blocked_at", { withTimezone: true }),
    // The Instagram-scoped ID of someone who messaged the business on Instagram.
    instagramUserId: text("instagram_user_id"),
    ...legacyId,
    ...timestamps,
  },
  (table) => [uniqueIndex("contacts_business_phone_unique").on(table.businessId, table.phone).where(sql`${table.phone} is not null`), index("contacts_business_email_idx").on(table.businessId, table.email), uniqueIndex("contacts_business_instagram_unique").on(table.businessId, table.instagramUserId).where(sql`${table.instagramUserId} is not null`)],
);

// A contact's keypad PIN for appointment changes, kept apart so the contact row never carries it.
export const contactPasscodes = pgTable(
  "contact_passcodes",
  {
    contactId: uuid("contact_id").primaryKey().references(() => contacts.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    passcodeHash: text("passcode_hash").notNull(),
    // Wrong PINs in a row, across calls. Reaching the limit sets lockedAt until a new PIN is set.
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    setAt: timestamp("set_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [index("contact_passcodes_business_idx").on(table.businessId)],
);

export const widgetKeys = pgTable(
  "widget_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    // The key itself, which is public, so the dashboard can show its snippet again. Null on older keys.
    keyValue: text("key_value"),
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
    // A website visitor asked for a person and is waiting for someone from the team to join.
    teamRequestedAt: timestamp("team_requested_at", { withTimezone: true }),
    // A team member joined the chat after the visitor asked for a person. Only such a chat goes back to the receptionist when the team goes quiet in it.
    teamJoinedAt: timestamp("team_joined_at", { withTimezone: true }),
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
    // The team member who wrote it, so a website chat can show their name.
    sentByUserId: uuid("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
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
    index("messages_sent_by_user_idx").on(table.sentByUserId).where(sql`${table.sentByUserId} is not null`),
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
  (table) => [
    uniqueIndex("transcripts_call_sequence_unique").on(table.callId, table.sequence),
    index("transcripts_business_expires_idx").on(table.businessId, table.expiresAt).where(sql`${table.expiresAt} is not null`),
  ],
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
    // The call it was made on: a keypad PIN accepted on a call counts only on that call.
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
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
  (table) => [uniqueIndex("knowledge_chunks_document_sequence_unique").on(table.documentId, table.sequence), index("knowledge_chunks_business_embedding_fingerprint_idx").on(table.businessId, table.embeddingFingerprint), index("knowledge_chunks_reembed_pending_idx").on(table.businessId).where(sql`${table.embedding} is null or ${table.embeddingStatus} in ('pending', 'failed')`), index("knowledge_chunks_keyword_idx").using("gin", sql`to_tsvector('simple', ${table.content})`)],
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

// A business's connected Instagram professional account, whose direct messages the receptionist answers.
export const instagramAccounts = pgTable(
  "instagram_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    instagramUserId: text("instagram_user_id").notNull(),
    username: text("username"),
    // The long-lived Instagram User access token, encrypted with ENCRYPTION_KEY.
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 }).default("connected").notNull(),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [uniqueIndex("instagram_accounts_instagram_user_unique").on(table.instagramUserId), uniqueIndex("instagram_accounts_business_unique").on(table.businessId)],
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

/** The items of a business's package subscription that bill its overage, one per meter, and the subscription they're on. */
export type StripeOverageItems = { subscriptionId: string; voice?: string; chat?: string };

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
    // A partner's business (migration 0142): the package its partner sells it,
    // or null when the partner bills it outside LobbyStack, and its
    // subscription on the partner's Stripe account. Only the system actor
    // writes these.
    packageId: uuid("package_id").references(() => partnerPackages.id, { onDelete: "set null" }),
    stripeAccountId: varchar("stripe_account_id", { length: 255 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    stripeSubscriptionState: varchar("stripe_subscription_state", { length: 32 }),
    stripeCurrentPeriodEnd: timestamp("stripe_current_period_end", { withTimezone: true }),
    // When the subscription was last read from Stripe, so a late read never overwrites a newer one.
    stripeSyncedAt: timestamp("stripe_synced_at", { withTimezone: true }),
    // The open checkout the business was sent to, reused so two clicks can't start two subscriptions.
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
    stripeCheckoutUrl: text("stripe_checkout_url"),
    stripeCheckoutExpiresAt: timestamp("stripe_checkout_expires_at", { withTimezone: true }),
    // A partner's business's overage on its package (migration 0155): whether
    // it keeps answering past the package's allowance, what each minute and
    // chat past it costs, and the monthly cap on that, or null for none, in
    // the minor unit of overageCurrency, the package's currency when the
    // partner set them. Only the system actor writes these.
    overageEnabled: boolean("overage_enabled").default(false).notNull(),
    overageCurrency: varchar("overage_currency", { length: 3 }),
    overageVoiceMinuteRateMinor: integer("overage_voice_minute_rate_minor").default(0).notNull(),
    overageChatRateMinor: integer("overage_chat_rate_minor").default(0).notNull(),
    overageCapMinor: integer("overage_cap_minor"),
    // The subscription items that bill the business's overage on its
    // partner's Stripe, one per meter, for the subscription they name
    // (migration 0156). Only the worker and the system actor write them.
    stripeOverageItems: jsonb("stripe_overage_items").$type<StripeOverageItems>(),
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

// The tier a partner buys from the host through Polar, and the terms of the tier in force (migration 0144).
export const partnerBillingAccounts = pgTable(
  "partner_billing_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    // partner:<partner id>, the external id of the partner's Polar customer.
    billingKey: text("billing_key").notNull(),
    customerId: text("customer_id"),
    subscriptionId: text("subscription_id"),
    tier: varchar("tier", { length: 16 }).$type<"free" | "starter" | "growth" | "scale">().default("free").notNull(),
    billingInterval: varchar("billing_interval", { length: 16 }).$type<"monthly" | "annual">(),
    subscriptionState: varchar("subscription_state", { length: 32 }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    // When a canceled tier ends, while it runs to the end of its period. Null while it renews.
    endsAt: timestamp("ends_at", { withTimezone: true }),
    poolVoiceSeconds: integer("pool_voice_seconds").notNull(),
    poolChats: integer("pool_chats").notNull(),
    includedNumbers: integer("included_numbers").notNull(),
    // Pool overage, on unless an owner turns it off, and its monthly cap in US cents. Null means no cap (migration 0153).
    poolOverageEnabled: boolean("pool_overage_enabled").default(true).notNull(),
    poolOverageCapCents: integer("pool_overage_cap_cents"),
    // The pool the host set while the deployment bills no tiers, each kind null for no limit (migration 0158).
    hostPoolVoiceSeconds: integer("host_pool_voice_seconds"),
    hostPoolChats: integer("host_pool_chats"),
    ...timestamps,
  },
  (table) => [uniqueIndex("partner_billing_accounts_partner_unique").on(table.partnerId), uniqueIndex("partner_billing_accounts_billing_key_unique").on(table.billingKey)],
);

// What a partner's businesses used each month, as its pool counts it (migration 0153). Only SECURITY DEFINER functions read and write it.
export const partnerUsageMonths = pgTable(
  "partner_usage_months",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    periodKey: varchar("period_key", { length: 16 }).notNull(),
    // Open reservations included.
    voiceSecondsUsed: doublePrecision("voice_seconds_used").default(0).notNull(),
    voiceSecondsFinal: doublePrecision("voice_seconds_final").default(0).notNull(),
    chatsUsed: doublePrecision("chats_used").default(0).notNull(),
    // Final usage past the pool while the partner paid for overage, and its cost at the tier's rates in US cents.
    overageVoiceSeconds: doublePrecision("overage_voice_seconds").default(0).notNull(),
    overageChats: doublePrecision("overage_chats").default(0).notNull(),
    overageSpendCents: doublePrecision("overage_spend_cents").default(0).notNull(),
    // The month's alerts already sent the partner's owners and admins, by alert, with when each was queued.
    alertsSent: jsonb("alerts_sent").$type<Record<string, string>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("partner_usage_months_partner_period_unique").on(table.partnerId, table.periodKey)],
);

// An owner's request for a Polar checkout of a tier, which the worker turns into a checkout page.
// Idempotency-Key records of the v1 Partner endpoints, which act on no one business (migration 0162).
export const partnerApiIdempotencyKeys = pgTable(
  "partner_api_idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 120 }).notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    requestHash: text("request_hash").notNull(),
    status: varchar("status", { length: 16 }).$type<"processing" | "completed">().default("processing").notNull(),
    response: jsonb("response").$type<{ status: number; body: unknown }>(),
    ...timestamps,
  },
  (table) => [uniqueIndex("partner_api_idempotency_keys_unique").on(table.partnerId, table.scope, table.key), index("partner_api_idempotency_keys_created_idx").on(table.createdAt)],
);

export const partnerCheckoutRequests = pgTable(
  "partner_checkout_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tier: varchar("tier", { length: 16 }).$type<"starter" | "growth" | "scale">().notNull(),
    billingInterval: varchar("billing_interval", { length: 16 }).$type<"monthly" | "annual">().notNull(),
    status: varchar("status", { length: 16 }).$type<"pending" | "processing" | "ready" | "error" | "superseded">().default("pending").notNull(),
    // The console's origin the owner started from, where Polar sends them back.
    returnOrigin: text("return_origin").notNull(),
    checkoutId: text("checkout_id"),
    checkoutUrl: text("checkout_url"),
    error: text("error"),
    ...timestamps,
  },
  (table) => [index("partner_checkout_requests_partner_status_idx").on(table.partnerId, table.status, table.createdAt)],
);

// Where a partner stands after its paid tier ends, since when, and when the tier ended (migration 0150). A partner with no row is active.
export const partnerLifecycles = pgTable(
  "partner_lifecycles",
  {
    partnerId: uuid("partner_id").primaryKey().references(() => partners.id, { onDelete: "cascade" }),
    state: varchar("state", { length: 16 }).$type<"active" | "past_due" | "ending" | "paused" | "deleted">().notNull(),
    since: timestamp("since", { withTimezone: true }).notNull(),
    tierEndedAt: timestamp("tier_ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("partner_lifecycles_state_since_idx").on(table.state, table.since).where(sql`${table.state} in ('past_due', 'ending', 'paused', 'deleted')`)],
);

// Every lifecycle step a partner took, and every business the host deleted at its end. It outlives the businesses (migration 0150).
export const partnerLifecycleEvents = pgTable(
  "partner_lifecycle_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 64 }).$type<"partner.lifecycle_changed" | "partner.business_deleted">().notNull(),
    businessId: uuid("business_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("partner_lifecycle_events_partner_idx").on(table.partnerId, table.createdAt)],
);

// What happened to the partner itself rather than to one of its businesses, such as an agency connection approved or revoked (migration 0164).
export const partnerAuditLogs = pgTable(
  "partner_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("partner_audit_logs_partner_idx").on(table.partnerId, table.createdAt)],
);

// Whether this deployment bills partners for tiers, as the worker last recorded it from the environment. At most one row (migration 0147).
export const partnerTierBilling = pgTable("partner_tier_billing", {
  id: smallint("id").default(1).primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// What the host pays each month for a number a partner's business holds while the deployment bills tiers, and the months settled since (migration 0147).
export const partnerNumberCharges = pgTable(
  "partner_number_charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    phoneNumberId: uuid("phone_number_id").notNull().references(() => phoneNumbers.id, { onDelete: "cascade" }),
    // US cents a month, read from the carrier when the number was bought.
    monthlyCostCents: integer("monthly_cost_cents").notNull(),
    // The number's months run from here.
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    monthsSettled: integer("months_settled").default(0).notNull(),
    monthsCharged: integer("months_charged").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("partner_number_charges_phone_number_unique").on(table.phoneNumberId),
    index("partner_number_charges_partner_idx").on(table.partnerId),
    index("partner_number_charges_business_idx").on(table.businessId),
  ],
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
    // The allowance, overage and pool terms in force when the usage happened (migration 0153).
    termsAtRecordTime: jsonb("terms_at_record_time").$type<Record<string, unknown>>(),
    // The partner whose pool the usage drew on, and once final, what it put past the pool and what that costs the partner in US cents.
    poolPartnerId: uuid("pool_partner_id"),
    poolOverageQuantity: doublePrecision("pool_overage_quantity"),
    poolOverageCents: doublePrecision("pool_overage_cents"),
    // Once final, what a package business's usage put past its own allowance, and what that costs it in the package's minor unit (migration 0155).
    businessOverageQuantity: doublePrecision("business_overage_quantity"),
    businessOverageMinor: doublePrecision("business_overage_minor"),
    // That overage's report to the partner's Stripe, apart from syncStatus's to Polar (migration 0156):
    // null with nothing to send, then pending, synced or skipped, and what Stripe has been sent, is being sent, and how many reports went.
    stripeSyncStatus: varchar("stripe_sync_status", { length: 32 }),
    stripeOverageReportedMinor: doublePrecision("stripe_overage_reported_minor").default(0).notNull(),
    stripeOverageSendingMinor: doublePrecision("stripe_overage_sending_minor"),
    stripeOverageReports: integer("stripe_overage_reports").default(0).notNull(),
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
    // The allowance alerts the month sent a business on a package, by key, such as minutes:80:600 (migration 0156).
    alertsSent: jsonb("alerts_sent").$type<Record<string, string>>().default({}).notNull(),
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
    // A Polar event for a partner's tier (migration 0144). An event belongs to a business or a partner, never both.
    partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 32 }).default("received").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_events_provider_id_unique").on(table.provider, table.providerEventId),
    index("provider_events_business_idx").on(table.businessId, table.createdAt),
    index("provider_events_partner_idx").on(table.partnerId, table.createdAt).where(sql`${table.partnerId} is not null`),
  ],
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

// The app name and logo the deployment shows in place of LobbyStack, chosen
// once in onboarding. One row at most; BRAND_APP_NAME and BRAND_LOGO_URL win
// over it. Only app.save_initial_branding writes it.
export const deploymentBranding = pgTable("deployment_branding", {
  id: smallint("id").default(1).primaryKey(),
  appName: text("app_name"),
  logo: bytea("logo"),
  logoContentType: varchar("logo_content_type", { length: 32 }),
  logoVersion: text("logo_version").generatedAlwaysAs(sql`encode(sha256(logo), 'hex')`),
  savedByUserId: uuid("saved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

// Platform keys live in the PLATFORM_API_KEYS environment variable, not in a
// table. A key with group access reaches the businesses linked to its group here.
export const platformKeyBusinesses = pgTable(
  "platform_key_businesses",
  {
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    groupId: varchar("group_id", { length: 40 }).notNull(),
    createdByPlatformKeyId: uuid("created_by_platform_key_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.businessId, table.groupId] }),
    index("platform_key_businesses_group_idx").on(table.groupId, table.createdAt),
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
    // The PLATFORM_API_KEYS entry that created the endpoint or turned it back on. Keys are not rows, so no foreign key.
    createdByPlatformKeyId: uuid("created_by_platform_key_id"),
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
  platformKeyBusinesses,
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
  partners,
  partnerMembers,
  partnerInvitations,
  partnerDomains,
  partnerPlatformKeys,
  partnerSignupInvitations,
  partnerStripeAccounts,
  partnerPackages,
  businesses,
  userActiveBusinesses,
  partnerBusinessOpens,
  businessTemplates,
  businessTemplateFiles,
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
  partnerBillingAccounts,
  partnerCheckoutRequests,
  partnerLifecycles,
  partnerLifecycleEvents,
  partnerAuditLogs,
  partnerTierBilling,
  partnerNumberCharges,
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
  deploymentBranding,
  platformKeyBusinesses,
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
