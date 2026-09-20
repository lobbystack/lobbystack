import {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseRole,
} from "@lobbystack/db";

const databases = new Map<DatabaseRole, DatabaseClient>();

/** Keep exactly one pg Pool per database role in the admin process. */
export function getDatabase(role: DatabaseRole): DatabaseClient {
  const existing = databases.get(role);
  if (existing) return existing;

  const database = createDatabaseClient(role);
  databases.set(role, database);
  return database;
}
