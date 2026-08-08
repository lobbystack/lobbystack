import {
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { id, legacyConvexId, timestamps } from "./_common";

export const affiliatesSchema = pgSchema("app");

export const affiliatePartners = affiliatesSchema.table(
  "affiliate_partners",
  {
    id: id(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contactEmail: text("contact_email"),
    status: text("status").notNull().default("active"),
    commissionBps: integer("commission_bps").notNull().default(0),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [index("affiliate_partners_code_idx").on(table.code)],
);

export const affiliateReferrals = affiliatesSchema.table(
  "affiliate_referrals",
  {
    id: id(),
    partnerId: text("partner_id").notNull(),
    businessId: text("business_id"),
    userId: text("user_id"),
    referralCode: text("referral_code").notNull(),
    status: text("status").notNull().default("pending"),
    attributedAt: timestamp("attributed_at", {
      withTimezone: true,
      mode: "date",
    }),
    convertedAt: timestamp("converted_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("affiliate_referrals_partner_id_idx").on(table.partnerId),
    index("affiliate_referrals_business_id_idx").on(table.businessId),
    index("affiliate_referrals_referral_code_idx").on(table.referralCode),
  ],
);

export const affiliateCommissions = affiliatesSchema.table(
  "affiliate_commissions",
  {
    id: id(),
    partnerId: text("partner_id").notNull(),
    referralId: text("referral_id").notNull(),
    businessId: text("business_id"),
    amountMicros: integer("amount_micros").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"),
    earnedAt: timestamp("earned_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("affiliate_commissions_partner_id_idx").on(table.partnerId),
    index("affiliate_commissions_referral_id_idx").on(table.referralId),
  ],
);
