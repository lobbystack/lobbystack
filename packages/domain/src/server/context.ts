import type { Database, DatabaseTransaction, RlsContext } from "@lobbystack/db";
import { withBusinessTransaction } from "@lobbystack/db";

import type { SnapshotCacheClient } from "./snapshotCache";

export type DomainContext = {
  db: Database;
  embeddings?: { fingerprint?: string; embed(values: string[], onUsage?: (usage: unknown) => Promise<void> | void): Promise<number[][]> };
  snapshotCache?: SnapshotCacheClient;
};

export type DomainActor = RlsContext & {
  userId?: string;
  businessId: string;
};

export async function inBusiness<T>(
  context: DomainContext,
  actor: DomainActor,
  callback: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return await withBusinessTransaction(context.db, {
    userId: actor.userId,
    businessId: actor.businessId,
    actorType: actor.actorType,
  }, callback);
}
