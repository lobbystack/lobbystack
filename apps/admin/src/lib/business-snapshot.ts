import { desc, eq } from "drizzle-orm";

import { snapshotSchema } from "@lobbystack/contracts";
import {
  businessContextSnapshots,
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
    async (tx) =>
      (
        await tx
          .select({ snapshot: businessContextSnapshots.snapshot })
          .from(businessContextSnapshots)
          .where(eq(businessContextSnapshots.businessId, businessId))
          .orderBy(desc(businessContextSnapshots.generatedAt))
          .limit(1)
      )[0]?.snapshot ?? null,
  );
}

export async function loadValidBusinessSnapshot(
  businessId: string,
): Promise<ReturnType<typeof snapshotSchema.parse> | null> {
  const current = await readLatestSnapshot(businessId);
  if (current === null) return null;

  const parsed = snapshotSchema.safeParse(current);
  if (parsed.success) return parsed.data;

  await refreshBusinessSnapshot(createWorkerDomainContext(), { businessId });
  const refreshed = await readLatestSnapshot(businessId);
  return refreshed === null ? null : snapshotSchema.parse(refreshed);
}
