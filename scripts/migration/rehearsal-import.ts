import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, realpath } from "node:fs/promises";
import { resolve, join, sep, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { type AnyPgTable } from "drizzle-orm/pg-core";
import * as schema from "../../packages/db/src/schema/index.ts";
import { assertSourceAccounting, compileSnapshot, REHEARSAL_TRANSFORMATIONS, type PlannedRow } from "./snapshot-plan.ts";
import { readSnapshot } from "./snapshot-plan-check.ts";
import { fileDigest, inspectStorage, transferLocalObjects, verifyLocalObjects } from "./snapshot-storage.ts";

const tables: Record<string, AnyPgTable> = Object.fromEntries((Object.values(schema) as unknown[]).filter((value): value is AnyPgTable => is(value, Table)).map((table) => [getTableName(table), table]));
const args = new Map(process.argv.slice(2).map((arg) => { const at = arg.indexOf("="); return [at < 0 ? arg : arg.slice(0, at), at < 0 ? "" : arg.slice(at + 1)]; }));
const required = (name: string): string => { const value = args.get(`--${name}`); if (!value) throw new Error(`MISSING_${name.toUpperCase().replaceAll("-", "_")}`); return value; };
const identifier = (name: string): string => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("INVALID_SQL_IDENTIFIER"); return `"${name}"`; };
const digest = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");

export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function assertRehearsalTarget(value: string, expected: string): void {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("ONLY_LOCAL_REHEARSAL_DATABASE_SUPPORTED");
  if (!/^migration_rehearsal_[a-z0-9_]+$/.test(expected) || decodeURIComponent(url.pathname) !== `/${expected}` || url.search) throw new Error("REHEARSAL_TARGET_MISMATCH");
  if (!["postgres", "lobbystack_migrator"].includes(decodeURIComponent(url.username))) throw new Error("MIGRATION_ROLE_REQUIRED");
}

async function verifyInventory(root: string, manifestPath: string, expectedHash: string): Promise<void> {
  if (await fileDigest(manifestPath) !== expectedHash) throw new Error("MANIFEST_HASH_MISMATCH");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { inventory: { path: string; size: number; sha256: string }[] };
  if (!Array.isArray(manifest.inventory)) throw new Error("MISSING_FILE_INVENTORY");
  const actual = new Set<string>();
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("SYMLINK_IN_SNAPSHOT");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) actual.add(path.slice(root.length + 1));
      else throw new Error("UNSAFE_SNAPSHOT_ENTRY");
    }
  }
  await visit(root);
  for (const file of manifest.inventory) {
    if (!file || typeof file.path !== "string" || !actual.delete(file.path) || resolve(root, file.path) !== `${root}${sep}${file.path}`) throw new Error("INVENTORY_FILE_MISMATCH");
    const path = join(root, file.path);
    if ((await lstat(path)).size !== file.size || await fileDigest(path) !== file.sha256) throw new Error("SNAPSHOT_FILE_CHANGED");
  }
  if (actual.size) throw new Error("UNMANIFESTED_SNAPSHOT_FILES");
}

function primaryKey(row: PlannedRow): Record<string, unknown> {
  if (row.values.id) return { id: row.values.id };
  if (row.table === "staff_service_assignments") return { staff_id: row.values.staff_id, service_id: row.values.service_id };
  throw new Error("UNSUPPORTED_PRIMARY_KEY");
}

async function main(): Promise<void> {
  const { createDatabaseClient } = await import("@lobbystack/db");
  const runId = required("run-id");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(runId)) throw new Error("INVALID_RUN_ID");
  if (required("source-deployment") !== "prod:determined-reindeer-80") throw new Error("SOURCE_NOT_ALLOWLISTED");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL_REQUIRED");
  const expectedDatabase = required("database");
  assertRehearsalTarget(targetUrl, expectedDatabase);
  const sourceRoot = await realpath(required("export"));
  const targetRoot = await realpath(required("objects"));
  if (targetRoot === sourceRoot || targetRoot.startsWith(`${sourceRoot}${sep}`) || sourceRoot.startsWith(`${targetRoot}${sep}`)) throw new Error("OBJECT_TARGET_OVERLAPS_SOURCE");
  const archiveHash = required("archive-sha256");
  if (!/^[a-f0-9]{64}$/.test(archiveHash) || await fileDigest(required("archive")) !== archiveHash) throw new Error("ARCHIVE_HASH_MISMATCH");
  await verifyInventory(sourceRoot, required("inventory"), required("inventory-sha256"));
  const snapshot = await readSnapshot(sourceRoot);
  const objects = await inspectStorage(sourceRoot, snapshot._storage ?? []);
  const plan = compileSnapshot(snapshot, objects);
  if (plan.issues.length) { console.error(JSON.stringify({ status: "blocked", issues: plan.issues })); process.exitCode = 1; return; }
  assertSourceAccounting(snapshot, plan);
  const policyPath = required("policy");
  if (await fileDigest(policyPath) !== required("policy-sha256")) throw new Error("POLICY_HASH_MISMATCH");
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  if (policy.scope !== "isolated-rehearsal-only" || policy.version !== 1 || canonical(policy.dispositions) !== canonical(plan.dispositions) || canonical(policy.transformations) !== canonical(REHEARSAL_TRANSFORMATIONS)) throw new Error("POLICY_DISPOSITION_MISMATCH");
  const nonce = process.env.REHEARSAL_TARGET_NONCE;
  if (!nonce || !/^[a-f0-9]{64}$/.test(nonce)) throw new Error("REHEARSAL_TARGET_NONCE_REQUIRED");
  const markerPath = join(targetRoot, ".migration-target.json");
  if ((await lstat(markerPath)).isSymbolicLink()) throw new Error("UNSAFE_TARGET_MARKER");
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  if (marker.database !== expectedDatabase || marker.nonce !== nonce) throw new Error("OBJECT_TARGET_MARKER_MISMATCH");
  // Detect source mutation between hashing and parsing; checks do not stand in
  // for operator approval of the separately hashed transformation policy.
  await verifyInventory(sourceRoot, required("inventory"), required("inventory-sha256"));
  const planHash = digest(plan);
  const reportParent = await realpath(dirname(resolve(required("report"))));
  if (reportParent === sourceRoot || reportParent.startsWith(`${sourceRoot}${sep}`) || reportParent === targetRoot || reportParent.startsWith(`${targetRoot}${sep}`)) throw new Error("REPORT_OVERLAPS_DATA");
  const report = await open(join(reportParent, basename(required("report"))), "wx", 0o600);
  const apply = args.has("--apply");
  const verifyOnly = args.has("--verify");
  if (apply && verifyOnly) { await report.close(); throw new Error("INCOMPATIBLE_MODES"); }
  const evidence: Record<string, unknown> = { runId, archiveHash, planHash, mode: apply ? "apply-isolated-local" : verifyOnly ? "verify-only" : "rollback-only", releaseCertified: false, startedAt: new Date().toISOString(), status: "failed", sourceCounts: plan.sourceCounts, dispositions: plan.dispositions };
  evidence.policyHash = required("policy-sha256");
  evidence.plannedObjects = plan.objects.map(({ id, key, size, sha256 }) => ({ id, key, size, sha256 }));
  const persist = async () => {
    const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
    await report.truncate(0); await report.write(bytes, 0, bytes.length, 0); await report.sync();
  };
  evidence.status = "started";
  await persist();
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: targetUrl });
  const client = await database.pool.connect();
  let transaction = false;
  try {
    await client.query("BEGIN"); transaction = true;
    await client.query("SELECT pg_advisory_xact_lock(704193812)");
    const identity = await client.query("SELECT current_database() AS database, current_user AS role");
    if (identity.rows[0]?.database !== expectedDatabase || !["postgres", "lobbystack_migrator"].includes(identity.rows[0]?.role)) throw new Error("CONNECTED_TARGET_MISMATCH");
    const markerRow = await client.query("SELECT database_name, nonce FROM migration_control.target");
    if (markerRow.rows.length !== 1 || markerRow.rows[0].database_name !== expectedDatabase || markerRow.rows[0].nonce !== nonce) throw new Error("DATABASE_TARGET_MARKER_MISMATCH");
    await client.query("SET LOCAL statement_timeout = '30s'");
    // This schema is a restricted migration journal, not a runtime data API.
    await client.query("CREATE SCHEMA IF NOT EXISTS migration_rehearsal");
    await client.query("REVOKE ALL ON SCHEMA migration_rehearsal FROM PUBLIC");
    await client.query("CREATE TABLE IF NOT EXISTS migration_rehearsal.runs (archive_hash text PRIMARY KEY, plan_hash text NOT NULL, report jsonb NOT NULL)");
    await client.query("CREATE TABLE IF NOT EXISTS migration_rehearsal.lineage (target_table text NOT NULL, target_key jsonb NOT NULL, source_table text NOT NULL, source_id text NOT NULL, row_hash text NOT NULL, legacy_metadata jsonb NOT NULL, PRIMARY KEY(target_table,target_key))");
    const previous = await client.query("SELECT plan_hash FROM migration_rehearsal.runs WHERE archive_hash=$1", [archiveHash]);
    // SQL follow-up migrations add FKs not yet represented in the Drizzle
    // model. Use the actual target catalog for dependency ordering.
    const foreignKeys = await client.query<{ table_name: string; column_name: string; parent_table: string; required: boolean }>(`
      SELECT child.relname AS table_name, a.attname AS column_name, parent.relname AS parent_table, a.attnotnull AS required
      FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=child.relnamespace JOIN pg_class parent ON parent.oid=c.confrelid
      JOIN pg_attribute a ON a.attrelid=child.oid AND a.attnum=c.conkey[1]
      WHERE c.contype='f' AND n.nspname='public' AND cardinality(c.conkey)=1
    `);
    const rerun = previous.rows.length > 0;
    if (verifyOnly && !rerun) throw new Error("TARGET_NOT_IMPORTED");
    if (rerun && previous.rows[0].plan_hash !== planHash) throw new Error("PREVIOUS_IMPORT_PLAN_DIFFERS");
    if (!rerun) {
      for (const name of Object.keys(tables)) {
        const count = await client.query(`SELECT count(*)::int AS count FROM public.${identifier(name)}`);
        if (count.rows[0].count !== 0) throw new Error(`TARGET_NOT_EMPTY:${name}`);
      }
      const pending = [...plan.rows];
      const inserted = new Set<string>();
      const deferred: { row: PlannedRow; column: string; value: unknown }[] = [];
      while (pending.length) {
        let progress = false;
        for (let index = pending.length - 1; index >= 0; index--) {
          const row = pending[index]!;
          const values = { ...row.values };
          const rowDeferred: typeof deferred = [];
          let blocked = false;
          for (const key of foreignKeys.rows.filter((key) => key.table_name === row.table)) {
            const value = values[key.column_name];
            if (value == null || inserted.has(`${key.parent_table}:${value}`)) continue;
            if (key.required) blocked = true;
            else { rowDeferred.push({ row, column: key.column_name, value }); values[key.column_name] = null; }
          }
          if (blocked) continue;
          const columns = Object.keys(values).filter((key) => values[key] !== undefined);
          const types = Object.fromEntries(Object.values(getTableColumns(tables[row.table]!)).map((column) => [column.name, column]));
          const params = columns.map((key) => types[key]?.dataType === "json" ? JSON.stringify(values[key]) : values[key]);
          try {
            await client.query(`INSERT INTO public.${identifier(row.table)} (${columns.map(identifier).join(",")}) VALUES (${params.map((_, i) => `$${i + 1}`).join(",")})`, params);
          } catch (error) {
            const code = (error as { code?: string }).code ?? "UNKNOWN";
            // Do not print pg DETAIL: it can contain customer records or hashes.
            const constraint = (error as { constraint?: string }).constraint;
            throw new Error(`INSERT_REJECTED:${row.table}:${code}${constraint && /^[a-z0-9_]+$/.test(constraint) ? `:${constraint}` : ""}`);
          }
          deferred.push(...rowDeferred);
          if (values.id) inserted.add(`${row.table}:${values.id}`);
          pending.splice(index, 1); progress = true;
        }
        if (!progress) throw new Error(`UNRESOLVED_INSERT_DEPENDENCIES:${[...new Set(pending.map((row) => row.table))].join(",")}`);
      }
      for (const item of deferred) {
        const keys = Object.entries(primaryKey(item.row));
        await client.query(`UPDATE public.${identifier(item.row.table)} SET ${identifier(item.column)}=$1 WHERE ${keys.map(([key], i) => `${identifier(key)}=$${i + 2}`).join(" AND ")}`, [item.value, ...keys.map(([, value]) => value)]);
      }
    }
    // Compare every mapped field after PostgreSQL type conversion, not only
    // counts. Then compare full target cardinality to detect duplicate writes.
    const counts: Record<string, number> = {};
    for (const row of plan.rows) {
      const keys = Object.entries(primaryKey(row));
      const readback = await client.query(`SELECT * FROM public.${identifier(row.table)} WHERE ${keys.map(([key], i) => `${identifier(key)}=$${i + 1}`).join(" AND ")}`, keys.map(([, value]) => value));
      if (readback.rows.length !== 1) throw new Error(`READBACK_MISSING:${row.table}`);
      for (const [key, value] of Object.entries(row.values)) {
        if (value !== undefined && canonical(readback.rows[0][key]) !== canonical(value)) throw new Error(`READBACK_MISMATCH:${row.table}:${key}`);
      }
      counts[row.table] = (counts[row.table] ?? 0) + 1;
      const rowHash = digest({ values: row.values, legacyMetadata: row.legacyMetadata ?? {} });
      if (!rerun) await client.query("INSERT INTO migration_rehearsal.lineage VALUES ($1,$2,$3,$4,$5,$6)", [row.table, JSON.stringify(primaryKey(row)), row.sourceTable, row.sourceId, rowHash, JSON.stringify(row.legacyMetadata ?? {})]);
      else {
        const lineage = await client.query("SELECT source_table,source_id,row_hash,legacy_metadata FROM migration_rehearsal.lineage WHERE target_table=$1 AND target_key=$2", [row.table, JSON.stringify(primaryKey(row))]);
        if (lineage.rows.length !== 1 || lineage.rows[0].source_table !== row.sourceTable || lineage.rows[0].source_id !== row.sourceId || lineage.rows[0].row_hash !== rowHash || canonical(lineage.rows[0].legacy_metadata) !== canonical(row.legacyMetadata ?? {})) throw new Error(`LINEAGE_MISMATCH:${row.table}`);
      }
    }
    for (const [name, expected] of Object.entries(counts)) {
      const result = await client.query(`SELECT count(*)::int AS count FROM public.${identifier(name)}`);
      if (result.rows[0].count !== expected) throw new Error(`TARGET_COUNT_MISMATCH:${name}`);
    }
    if (apply) {
      await mkdir(targetRoot, { recursive: true, mode: 0o700 });
      await transferLocalObjects(sourceRoot, targetRoot, plan.objects);
      await verifyLocalObjects(targetRoot, plan.objects);
    }
    if (verifyOnly) await verifyLocalObjects(targetRoot, plan.objects);
    evidence.targetCounts = counts; evidence.objectsVerified = apply || verifyOnly ? plan.objects.length : 0;
    evidence.idempotentReplay = rerun;
    evidence.status = apply ? "committed" : verifyOnly ? "verified" : "rolled-back";
    evidence.finishedAt = new Date().toISOString();
    if (!rerun) await client.query("INSERT INTO migration_rehearsal.runs VALUES ($1,$2,$3)", [archiveHash, planHash, JSON.stringify(evidence)]);
    await client.query(apply ? "COMMIT" : "ROLLBACK"); transaction = false;
    console.log(JSON.stringify({ status: evidence.status, rowsVerified: plan.rows.length, objectsVerified: evidence.objectsVerified, idempotentReplay: rerun, releaseCertified: false }));
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error instanceof Error && /^[A-Z_]+(?::[a-zA-Z0-9_,]+)*$/.test(error.message) ? error.message : "IMPORT_FAILED_REDACTED";
    process.exitCode = 1;
    console.error(JSON.stringify({ status: "failed", error: evidence.error }));
  } finally {
    if (transaction) await client.query("ROLLBACK").catch(() => undefined);
    client.release(); await database.pool.end();
    evidence.finishedAt ??= new Date().toISOString();
    await persist(); await report.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error) => { console.error(error instanceof Error && /^[A-Z_]+(?::[a-zA-Z0-9_,]+)*$/.test(error.message) ? error.message : "REHEARSAL_IMPORT_BLOCKED"); process.exitCode = 1; });
