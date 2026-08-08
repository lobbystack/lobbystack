import { smsComplianceProfiles } from "@lobbystack/db";
import type { UpdateSmsComplianceRequest } from "@lobbystack/contracts";
import { eq } from "drizzle-orm";

import { getAppPool, withDomainTransaction, type TransactionContext } from "./context";

export async function getSmsComplianceState(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [profile] = await db
        .select()
        .from(smsComplianceProfiles)
        .where(eq(smsComplianceProfiles.businessId, input.businessId))
        .limit(1);

      return profile ?? null;
    },
  );
}

export async function updateSmsComplianceState(input: {
  businessId: string;
  values: UpdateSmsComplianceRequest;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [existing] = await db
        .select({ id: smsComplianceProfiles.id })
        .from(smsComplianceProfiles)
        .where(eq(smsComplianceProfiles.businessId, input.businessId))
        .limit(1);

      const values = {
        businessId: input.businessId,
        status: input.values.status,
        draftJson: {
          brandStatus: input.values.brandStatus,
          campaignStatus: input.values.campaignStatus,
          a2pStatus: input.values.a2pStatus,
          ...(input.values.lastError !== undefined
            ? { lastError: input.values.lastError }
            : {}),
        },
      };

      if (existing) {
        await db
          .update(smsComplianceProfiles)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(smsComplianceProfiles.id, existing.id));
      } else {
        await db.insert(smsComplianceProfiles).values(values);
      }
    },
  );
}
