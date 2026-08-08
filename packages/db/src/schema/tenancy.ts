import {
  boolean,
  index,
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

export const appSchema = pgSchema("app");

export const businesses = appSchema.table(
  "businesses",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    locale: text("locale").notNull().default("en"),
    status: text("status").notNull().default("active"),
    onboardingStep: text("onboarding_step"),
    ownerUserId: text("owner_user_id"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("businesses_slug_idx").on(table.slug),
    index("businesses_owner_user_id_idx").on(table.ownerUserId),
  ],
);

export const memberships = appSchema.table(
  "memberships",
  {
    id: id(),
    businessId: businessIdColumn(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    invitedByUserId: text("invited_by_user_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("memberships_business_user_idx").on(
      table.businessId,
      table.userId,
    ),
    index("memberships_user_id_idx").on(table.userId),
  ],
);

export const invitations = appSchema.table(
  "invitations",
  {
    id: id(),
    businessId: businessIdColumn(),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: text("invited_by_user_id").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_idx").on(table.tokenHash),
    index("invitations_business_id_idx").on(table.businessId),
    index("invitations_email_idx").on(table.email),
  ],
);

export const businessSettings = appSchema.table(
  "business_settings",
  {
    id: id(),
    businessId: businessIdColumn(),
    key: text("key").notNull(),
    valueJson: text("value_json").notNull(),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("business_settings_business_key_idx").on(
      table.businessId,
      table.key,
    ),
  ],
);

export const setupGuideProgress = appSchema.table(
  "setup_guide_progress",
  {
    id: id(),
    businessId: businessIdColumn(),
    stepId: text("step_id").notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("setup_guide_progress_business_step_idx").on(
      table.businessId,
      table.stepId,
    ),
  ],
);
