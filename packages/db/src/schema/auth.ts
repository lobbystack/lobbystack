import {
  boolean,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_common";

export const authSchema = pgSchema("auth");

export const users = authSchema.table(
  "users",
  {
    id: id(),
    name: text("name"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("user"),
    authSubject: text("auth_subject"),
    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    phone: text("phone"),
    phoneVerifiedAt: timestamp("phone_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    displayName: text("display_name"),
    imageUrl: text("image_url"),
    preferredLocale: text("preferred_locale"),
    platformRole: text("platform_role"),
    activeBusinessId: text("active_business_id"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    signupAttribution: text("signup_attribution"),
    legacyConvexId: text("legacy_convex_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("users_auth_subject_idx").on(table.authSubject),
    index("users_email_idx").on(table.email),
    index("users_phone_idx").on(table.phone),
  ],
);

export const accounts = authSchema.table(
  "accounts",
  {
    id: id(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    provider: text("provider"),
    providerAccountId: text("provider_account_id"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    legacyConvexId: text("legacy_convex_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("accounts_provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const sessions = authSchema.table(
  "sessions",
  {
    id: id(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    sessionToken: text("session_token"),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    legacyConvexId: text("legacy_convex_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("sessions_token_idx").on(table.token),
    uniqueIndex("sessions_session_token_idx").on(table.sessionToken),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const verificationTokens = authSchema.table(
  "verification_tokens",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    token: text("token"),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("verification_tokens_identifier_token_idx").on(
      table.identifier,
      table.token,
    ),
  ],
);

export const pendingEmailChanges = authSchema.table(
  "pending_email_changes",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("pending_email_changes_account_id_idx").on(table.accountId),
    index("pending_email_changes_code_hash_idx").on(table.codeHash),
  ],
);
