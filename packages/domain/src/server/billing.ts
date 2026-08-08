import {
  billingAccounts,
  billingAddons,
  billingSubscriptions,
  usageRecords,
} from "@lobbystack/db";
import type { BillingRecordUsageJobPayload } from "@lobbystack/contracts";
import { and, desc, eq } from "drizzle-orm";

import {
  enqueueSideEffect,
  getAppPool,
  getDispatcherPool,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

export async function getBillingAccount(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [account] = await db
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.businessId, input.businessId))
        .limit(1);

      return account ?? null;
    },
  );
}

export async function createPolarCheckoutSession(input: {
  businessId: string;
  planSlug: string;
  pool?: TransactionContext["pool"];
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  return {
    checkoutUrl: `https://polar.sh/checkout/stub/${input.businessId}/${input.planSlug}`,
    sessionId: `polar_session_stub_${input.businessId}`,
  };
}

export async function reconcilePolarSubscription(input: {
  businessId: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  planSlug: string;
  status: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      let [account] = await db
        .select({ id: billingAccounts.id })
        .from(billingAccounts)
        .where(eq(billingAccounts.businessId, input.businessId))
        .limit(1);

      if (account) {
        await db
          .update(billingAccounts)
          .set({
            providerCustomerId: input.providerCustomerId,
            planSlug: input.planSlug,
            status: input.status,
            updatedAt: new Date(),
          })
          .where(eq(billingAccounts.id, account.id));
      } else {
        [account] = await db
          .insert(billingAccounts)
          .values({
            businessId: input.businessId,
            providerCustomerId: input.providerCustomerId,
            planSlug: input.planSlug,
            status: input.status,
          })
          .returning({ id: billingAccounts.id });
      }

      if (!account) {
        throw new Error("Billing account was not created");
      }

      await db.insert(billingSubscriptions).values({
        businessId: input.businessId,
        billingAccountId: account.id,
        providerSubscriptionId: input.providerSubscriptionId,
        planSlug: input.planSlug,
        status: input.status,
      });

      return account;
    },
  );
}

export async function recordUsage(input: {
  payload: BillingRecordUsageJobPayload;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    {
      businessId: input.payload.businessId,
      actorType: "worker",
      pool: input.pool ?? getWorkerPool(),
    },
    async (db) => {
      const [record] = await db
        .insert(usageRecords)
        .values({
          businessId: input.payload.businessId,
          usageKind: input.payload.usageKind,
          quantity: Math.round(input.payload.quantity),
          unit: input.payload.usageKind === "voice_seconds" ? "seconds" : "segments",
          recordedAt: new Date(input.payload.recordedAt),
          sourceRef: input.payload.sourceKey,
        })
        .returning({ id: usageRecords.id });

      if (record) {
        await enqueueSideEffect(db, {
          businessId: input.payload.businessId,
          topic: "billing.syncUsage",
          payload: {
            businessId: input.payload.businessId,
            usageEventId: record.id,
          },
          dedupeKey: `billing.sync:${record.id}`,
        });
      }
    },
  );
}

export async function listBillingAddons(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(billingAddons)
        .where(and(eq(billingAddons.businessId, input.businessId), eq(billingAddons.status, "active"))),
  );
}

export async function resolveBusinessByPolarCustomerId(input: {
  polarCustomerId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { actorType: "dispatcher", pool: input.pool ?? getDispatcherPool() },
    async (db) => {
      const [account] = await db
        .select({ businessId: billingAccounts.businessId })
        .from(billingAccounts)
        .where(eq(billingAccounts.providerCustomerId, input.polarCustomerId))
        .limit(1);

      return account?.businessId ?? null;
    },
  );
}

export async function listRecentUsage(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.businessId, input.businessId))
        .orderBy(desc(usageRecords.recordedAt))
        .limit(50),
  );
}
