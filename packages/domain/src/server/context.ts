import type { Database, DatabaseTransaction, RlsContext } from "@lobbystack/db";
import { withBusinessTransaction } from "@lobbystack/db";
import { createTelemetryFacade, type TelemetryFacade } from "@lobbystack/telemetry";

import type { SnapshotCacheClient } from "./snapshotCache";

export type DomainContext = {
  db: Database;
  telemetry?: TelemetryFacade;
  embeddings?: { embed(values: string[]): Promise<number[][]> };
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

export function withDefaultTelemetry(context: DomainContext): DomainContext & { telemetry: TelemetryFacade } {
  return {
    ...context,
    telemetry: context.telemetry ?? createTelemetryFacade("development", []),
  };
}
