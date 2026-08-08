import { affiliateCommissions, affiliatePartners, affiliateReferrals } from "@lobbystack/db";
import type { AffiliateClickRequest } from "@lobbystack/contracts";
import { and, desc, eq } from "drizzle-orm";

import {
  enqueueSideEffect,
  getAppPool,
  getDispatcherPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

export async function recordAffiliateClick(input: {
  values: AffiliateClickRequest;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      const [partner] = await db
        .select({ id: affiliatePartners.id })
        .from(affiliatePartners)
        .where(
          and(
            eq(affiliatePartners.code, input.values.referralCode),
            eq(affiliatePartners.status, "active"),
          ),
        )
        .limit(1);

      if (!partner) {
        return null;
      }

      const [referral] = await db
        .insert(affiliateReferrals)
        .values({
          partnerId: partner.id,
          referralCode: input.values.referralCode,
          status: "pending",
          attributedAt: new Date(),
          metadataJson: {
            ...(input.values.visitorId ? { visitorId: input.values.visitorId } : {}),
            ...(input.values.sourceUrl ? { sourceUrl: input.values.sourceUrl } : {}),
          },
        })
        .returning({ id: affiliateReferrals.id });

      return referral ?? null;
    },
  );
}

export async function attributeAffiliateReferral(input: {
  referralCode: string;
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      await db
        .update(affiliateReferrals)
        .set({
          businessId: input.businessId,
          status: "converted",
          convertedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(affiliateReferrals.referralCode, input.referralCode));
    },
  );
}

export async function listAffiliateCommissions(input: {
  partnerId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) =>
      db
        .select()
        .from(affiliateCommissions)
        .where(eq(affiliateCommissions.partnerId, input.partnerId))
        .orderBy(desc(affiliateCommissions.earnedAt))
        .limit(100),
  );
}

export async function queueAffiliatePayoutRun(input?: {
  periodKey?: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { actorType: "dispatcher", pool: input?.pool ?? getDispatcherPool() },
    async (db) => {
      await enqueueSideEffect(db, {
        businessId: "00000000-0000-0000-0000-000000000000",
        topic: "affiliate.generatePayoutRun",
        payload: {
          ...(input?.periodKey ? { periodKey: input.periodKey } : {}),
          createdAt: new Date().toISOString(),
        },
        dedupeKey: `affiliate:payout:${input?.periodKey ?? "current"}`,
      });
    },
  );
}

export async function listPartnerReferrals(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(affiliateReferrals)
        .where(eq(affiliateReferrals.businessId, input.businessId))
        .orderBy(desc(affiliateReferrals.attributedAt))
        .limit(20),
  );
}
