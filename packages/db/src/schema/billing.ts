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

export const billingSchema = pgSchema("app");

export const billingAccounts = billingSchema.table(
  "billing_accounts",
  {
    id: id(),
    businessId: businessIdColumn(),
    provider: text("provider").notNull().default("polar"),
    providerCustomerId: text("provider_customer_id"),
    planSlug: text("plan_slug").notNull().default("free_cloud"),
    billingInterval: text("billing_interval"),
    status: text("status").notNull().default("active"),
    trialEndsAt: timestamp("trial_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("billing_accounts_business_id_idx").on(table.businessId),
    index("billing_accounts_provider_customer_id_idx").on(
      table.providerCustomerId,
    ),
  ],
);

export const billingSubscriptions = billingSchema.table(
  "billing_subscriptions",
  {
    id: id(),
    businessId: businessIdColumn(),
    billingAccountId: text("billing_account_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id"),
    planSlug: text("plan_slug").notNull(),
    status: text("status").notNull().default("active"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
      mode: "date",
    }),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
      mode: "date",
    }),
    cancelAtPeriodEnd: text("cancel_at_period_end"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("billing_subscriptions_business_id_idx").on(table.businessId),
    index("billing_subscriptions_provider_subscription_id_idx").on(
      table.providerSubscriptionId,
    ),
  ],
);

export const billingAddons = billingSchema.table(
  "billing_addons",
  {
    id: id(),
    businessId: businessIdColumn(),
    addonSlug: text("addon_slug").notNull(),
    status: text("status").notNull().default("active"),
    quantity: integer("quantity").notNull().default(1),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("billing_addons_business_id_idx").on(table.businessId),
    index("billing_addons_addon_slug_idx").on(table.addonSlug),
  ],
);

export const usageRecords = billingSchema.table(
  "usage_records",
  {
    id: id(),
    businessId: businessIdColumn(),
    usageKind: text("usage_kind").notNull(),
    quantity: integer("quantity").notNull(),
    unit: text("unit").notNull(),
    recordedAt: timestamp("recorded_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    sourceRef: text("source_ref"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("usage_records_business_id_idx").on(table.businessId),
    index("usage_records_recorded_at_idx").on(table.recordedAt),
    index("usage_records_usage_kind_idx").on(table.usageKind),
  ],
);

export const unitEconomicsEvents = billingSchema.table(
  "unit_economics_events",
  {
    id: id(),
    businessId: businessIdColumn(),
    eventKind: text("event_kind").notNull(),
    channel: text("channel").notNull(),
    quantity: integer("quantity").notNull(),
    quantityUnit: text("quantity_unit").notNull(),
    costMicros: integer("cost_micros"),
    revenueMicros: integer("revenue_micros"),
    currency: text("currency").default("USD"),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("unit_economics_events_business_id_idx").on(table.businessId),
    index("unit_economics_events_occurred_at_idx").on(table.occurredAt),
  ],
);
