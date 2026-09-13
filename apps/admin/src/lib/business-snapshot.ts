import { desc, eq } from "drizzle-orm";

import { snapshotSchema } from "@lobbystack/contracts";
import {
  businessContextSnapshots,
  businesses,
  withBusinessTransaction,
} from "@lobbystack/db";
import { refreshBusinessSnapshot } from "@lobbystack/domain";

import { getWorkerDatabase } from "./api-helpers";
import { createWorkerDomainContext } from "./domain-context";

async function readLatestSnapshot(
  businessId: string,
): Promise<unknown | null> {
  return await withBusinessTransaction(
    getWorkerDatabase().db,
    { businessId, actorType: "worker" },
    async (tx) => {
      const [row] = await tx
        .select({ snapshot: businessContextSnapshots.snapshot, telemetryEnabled: businesses.telemetryEnabled })
        .from(businessContextSnapshots)
        .innerJoin(businesses, eq(businessContextSnapshots.businessId, businesses.id))
        .where(eq(businessContextSnapshots.businessId, businessId))
        .orderBy(desc(businessContextSnapshots.generatedAt))
        .limit(1);
      if (!row) return null;
      // Consent is authoritative at call start, even when the content snapshot
      // was cached before the operator changed their analytics preference.
      return row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot)
        ? { ...row.snapshot, telemetryEnabled: row.telemetryEnabled === true }
        : row.snapshot;
    },
  );
}

export async function loadValidBusinessSnapshot(
  businessId: string,
): Promise<ReturnType<typeof snapshotSchema.parse> | null> {
  const current = await readLatestSnapshot(businessId);
  const parsed = snapshotSchema.safeParse(current);
  if (parsed.success && parsed.data.businessId === businessId) return parsed.data;

  await refreshBusinessSnapshot(createWorkerDomainContext(), { businessId });
  const refreshed = await readLatestSnapshot(businessId);
  if (refreshed === null) return null;
  const verified = snapshotSchema.parse(refreshed);
  if (verified.businessId !== businessId) throw new Error("Business snapshot identity mismatch.");
  return verified;
}
