import type { Pool, PoolConfig } from "pg";
import pg from "pg";

export type DbRole =
  | "auth"
  | "app"
  | "worker"
  | "dispatcher"
  | "readonly"
  | "migrator";

const ROLE_ENV_KEYS: Record<DbRole, string[]> = {
  migrator: ["DATABASE_URL_MIGRATOR", "DATABASE_URL"],
  auth: ["DATABASE_URL_AUTH", "DATABASE_URL"],
  app: ["DATABASE_URL_APP", "DATABASE_URL"],
  worker: ["DATABASE_URL_WORKER", "DATABASE_URL"],
  dispatcher: ["DATABASE_URL_DISPATCHER", "DATABASE_URL"],
  readonly: ["DATABASE_URL_READONLY", "DATABASE_URL"],
};

const poolCache = new Map<DbRole, Pool>();

export function getConnectionString(role: DbRole): string {
  for (const key of ROLE_ENV_KEYS[role]) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  throw new Error(
    `Missing database connection string for role "${role}". Set one of: ${ROLE_ENV_KEYS[role].join(", ")}`,
  );
}

export function createPool(
  role: DbRole,
  config: Omit<PoolConfig, "connectionString"> = {},
): Pool {
  return new pg.Pool({
    connectionString: getConnectionString(role),
    max: config.max ?? defaultPoolSize(role),
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    ...config,
  });
}

function defaultPoolSize(role: DbRole): number {
  switch (role) {
    case "worker":
    case "dispatcher":
      return 10;
    case "readonly":
      return 5;
    default:
      return 20;
  }
}

export function getPool(role: DbRole): Pool {
  const existing = poolCache.get(role);
  if (existing) {
    return existing;
  }

  const pool = createPool(role);
  poolCache.set(role, pool);
  return pool;
}

export async function closeAllPools(): Promise<void> {
  await Promise.all(
    [...poolCache.values()].map(async (pool) => {
      await pool.end();
    }),
  );
  poolCache.clear();
}

export const pools = {
  migrator: () => getPool("migrator"),
  auth: () => getPool("auth"),
  app: () => getPool("app"),
  worker: () => getPool("worker"),
  dispatcher: () => getPool("dispatcher"),
  readonly: () => getPool("readonly"),
} as const;
