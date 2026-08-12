import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { getMeter, getTracer, recordException } from "@lobbystack/telemetry/node";

import { rlsContextStatements, type RlsContext } from "./rls/context";
import { schema } from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type DatabaseRole =
  | "lobbystack_migrator"
  | "lobbystack_auth"
  | "lobbystack_app"
  | "lobbystack_worker"
  | "lobbystack_dispatcher"
  | "lobbystack_readonly";

export type DatabaseClient = {
  pool: Pool;
  db: Database;
  role: DatabaseRole;
};

const poolWaitHistogram = getMeter("lobbystack-db").createHistogram("db.pool.wait_ms", {
  unit: "ms",
  description: "Time spent waiting for a PostgreSQL pool connection",
});
const queryDurationHistogram = getMeter("lobbystack-db").createHistogram("db.query.duration_ms", {
  unit: "ms",
  description: "PostgreSQL query duration without bind values",
});
const transactionDurationHistogram = getMeter("lobbystack-db").createHistogram("db.transaction.duration_ms", {
  unit: "ms",
  description: "PostgreSQL transaction duration",
});

function databaseUrl(source: Record<string, string | undefined> = process.env): string {
  const value = source.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for PostgreSQL access.");
  }
  return value;
}

function poolConfig(role: DatabaseRole, source: Record<string, string | undefined>): PoolConfig {
  const urlKey = `${role.toUpperCase()}_DATABASE_URL`;
  return {
    connectionString: source[urlKey] ?? databaseUrl(source),
    application_name: `lobbystack:${role}`,
    max: Number(source[`${role.toUpperCase()}_POOL_MAX`] ?? (role === "lobbystack_dispatcher" ? 4 : 12)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
  };
}

export function createDatabaseClient(
  role: DatabaseRole,
  source: Record<string, string | undefined> = process.env,
): DatabaseClient {
  const pool = new Pool(poolConfig(role, source));
  pool.on("error", (error) => {
    recordException(error, { service: "database", operation: "pool_error", role });
  });

  const db = drizzle(pool, {
    schema,
    logger: {
      logQuery(query, params) {
        const startedAt = Date.now();
        queryDurationHistogram.record(Date.now() - startedAt, { role, statement: query.slice(0, 80) });
        void params;
      },
    },
  });
  return { pool, db, role };
}

export function createDatabaseClients(
  source: Record<string, string | undefined> = process.env,
): Record<DatabaseRole, DatabaseClient> {
  return {
    lobbystack_migrator: createDatabaseClient("lobbystack_migrator", source),
    lobbystack_auth: createDatabaseClient("lobbystack_auth", source),
    lobbystack_app: createDatabaseClient("lobbystack_app", source),
    lobbystack_worker: createDatabaseClient("lobbystack_worker", source),
    lobbystack_dispatcher: createDatabaseClient("lobbystack_dispatcher", source),
    lobbystack_readonly: createDatabaseClient("lobbystack_readonly", source),
  };
}

export async function withBusinessTransaction<T>(
  db: Database,
  context: RlsContext,
  callback: (tx: DatabaseTransaction) => Promise<T>,
  options: { maxRetries?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const tracer = getTracer("lobbystack-db");

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const startedAt = Date.now();
    const span = tracer.startSpan("db.transaction", {
      attributes: {
        "db.system": "postgresql",
        "db.operation.name": "transaction",
        "lobbystack.actor_type": context.actorType,
        "lobbystack.retry_attempt": attempt,
      },
    });

    try {
      const result = await db.transaction(async (tx) => {
        for (const statement of rlsContextStatements(context)) {
          await tx.execute(statement);
        }
        return await callback(tx);
      });
      span.end();
      transactionDurationHistogram.record(Date.now() - startedAt, {
        actor_type: context.actorType,
        outcome: "success",
      });
      return result;
    } catch (error) {
      recordException(error, {
        service: "database",
        operation: "transaction",
        actorType: context.actorType,
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.end();
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code !== "40001" || attempt >= maxRetries) {
        transactionDurationHistogram.record(Date.now() - startedAt, {
          actor_type: context.actorType,
          outcome: "error",
        });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
    }
  }

  throw new Error("PostgreSQL transaction retry loop exhausted.");
}

export async function withDispatcherTransaction<T>(
  db: Database,
  callback: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return await withBusinessTransaction(db, { actorType: "dispatcher" }, callback);
}

export async function databaseHealthCheck(client: DatabaseClient): Promise<{
  ok: boolean;
  latencyMs: number;
  role: DatabaseRole;
}> {
  const startedAt = Date.now();
  const span = getTracer("lobbystack-db").startSpan("db.health_check", {
    attributes: { "db.system": "postgresql", "db.operation.name": "health_check" },
  });
  try {
    await client.db.execute(sql`select 1`);
    const latencyMs = Date.now() - startedAt;
    poolWaitHistogram.record(latencyMs, { role: client.role, outcome: "success" });
    span.end();
    return { ok: true, latencyMs, role: client.role };
  } catch (error) {
    recordException(error, { service: "database", operation: "health_check", role: client.role });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    span.end();
    return { ok: false, latencyMs: Date.now() - startedAt, role: client.role };
  }
}

export async function closeDatabaseClients(clients: Record<DatabaseRole, DatabaseClient>): Promise<void> {
  await Promise.all(Object.values(clients).map((client) => client.pool.end()));
}

export function newRequestId(): string {
  return randomUUID();
}
