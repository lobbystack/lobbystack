import {
  enqueueOutboxMessage,
  pools,
  schema,
  type RlsContext,
  withBusinessTransaction,
} from "@lobbystack/db";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";

export type DomainDb = NodePgDatabase<typeof schema>;

export function createDb(client: PoolClient): DomainDb {
  return drizzle(client, { schema });
}

export function getAppPool(): Pool {
  return pools.app();
}

export function getWorkerPool(): Pool {
  return pools.worker();
}

export function getDispatcherPool(): Pool {
  return pools.dispatcher();
}

export function getReadonlyPool(): Pool {
  return pools.readonly();
}

export type TransactionContext = {
  businessId?: string;
  userId?: string;
  actorType: RlsContext["actorType"];
  pool?: Pool;
};

export async function withDomainTransaction<T>(
  context: TransactionContext,
  fn: (db: DomainDb, client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = context.pool ?? getAppPool();
  const { pool: _pool, businessId, userId, actorType } = context;

  return withBusinessTransaction(
    pool,
    {
      businessId: businessId ?? "",
      ...(userId ? { userId } : {}),
      actorType,
    },
    async (client) => fn(createDb(client), client),
  );
}

export async function enqueueSideEffect(
  db: DomainDb,
  input: {
    businessId: string;
    topic: string;
    payload: Record<string, unknown>;
    dedupeKey?: string;
    availableAt?: Date;
  },
): Promise<string> {
  return enqueueOutboxMessage(db, input);
}
