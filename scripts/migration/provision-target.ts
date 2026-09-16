import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { assertProductionTarget, SHA256_PATTERN } from "./import-engine.ts";

/**
 * Provisions the restricted `migration_control` journal used by the production
 * importer and reconciliation tooling. It is idempotent: re-running it only
 * refreshes the target marker when the nonce or database name changes.
 *
 * Required environment:
 *   PRODUCTION_IMPORT_DATABASE_URL  non-local postgres URL for the target
 *   PRODUCTION_IMPORT_TARGET_NONCE  64-char hex nonce for the target identity
 *   PRODUCTION_IMPORT_APPROVED      "true" (a write against production)
 */
async function main(): Promise<void> {
  if (process.env.PRODUCTION_IMPORT_APPROVED !== "true") throw new Error("PRODUCTION_IMPORT_NOT_APPROVED");
  const targetUrl = process.env.PRODUCTION_IMPORT_DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_IMPORT_DATABASE_URL_REQUIRED");
  const databaseName = assertProductionTarget(targetUrl);
  const nonce = process.env.PRODUCTION_IMPORT_TARGET_NONCE;
  if (!nonce || !SHA256_PATTERN.test(nonce)) throw new Error("PRODUCTION_IMPORT_TARGET_NONCE_REQUIRED");

  const { createDatabaseClient } = await import("@lobbystack/db");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: targetUrl });
  const client = await database.pool.connect();
  try {
    const identity = await client.query("SELECT current_database() AS database, current_user AS role");
    if (identity.rows[0]?.database !== databaseName || identity.rows[0]?.role !== "postgres") {
      throw new Error("CONNECTED_TARGET_MISMATCH");
    }
    await client.query("BEGIN");
    try {
      await client.query("CREATE SCHEMA IF NOT EXISTS migration_control");
      await client.query("REVOKE ALL ON SCHEMA migration_control FROM PUBLIC");
      await client.query("CREATE TABLE IF NOT EXISTS migration_control.target (database_name text PRIMARY KEY, nonce text NOT NULL)");
      await client.query("CREATE TABLE IF NOT EXISTS migration_control.runs (archive_hash text PRIMARY KEY, plan_hash text NOT NULL, report jsonb NOT NULL)");
      await client.query(
        "CREATE TABLE IF NOT EXISTS migration_control.lineage (target_table text NOT NULL, target_key jsonb NOT NULL, source_table text NOT NULL, source_id text NOT NULL, row_hash text NOT NULL, legacy_metadata jsonb NOT NULL, PRIMARY KEY(target_table,target_key))",
      );
      const existing = await client.query("SELECT database_name, nonce FROM migration_control.target");
      if (existing.rows.length === 0) {
        await client.query("INSERT INTO migration_control.target (database_name, nonce) VALUES ($1,$2)", [databaseName, nonce]);
      } else if (existing.rows.length === 1 && existing.rows[0].database_name === databaseName && existing.rows[0].nonce === nonce) {
        // idempotent no-op
      } else {
        throw new Error("DATABASE_TARGET_MARKER_MISMATCH");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    console.log(JSON.stringify({ status: "provisioned", database: databaseName, nonceSet: true, releaseCertified: false }));
  } finally {
    client.release();
    await database.pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    const message = error instanceof Error && /^[A-Z_]+(?::[a-zA-Z0-9_,]+)*$/.test(error.message) ? error.message : "PROVISION_FAILED_REDACTED";
    console.error(JSON.stringify({ status: "failed", error: message }));
    process.exitCode = 1;
  });
}
