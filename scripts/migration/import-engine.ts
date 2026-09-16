import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { type AnyPgTable } from "drizzle-orm/pg-core";
import * as schema from "../../packages/db/src/schema/index.ts";
import { REHEARSAL_TRANSFORMATIONS, type PlannedRow, type SnapshotPlan } from "./snapshot-plan.ts";
import { fileDigest } from "./snapshot-storage.ts";

export const PRODUCTION_SOURCE_DEPLOYMENT = "prod:determined-reindeer-80";
export const PRODUCTION_POLICY_SCOPE = "production-import";
export const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type ImportMode = "plan-only" | "verify" | "apply";
export type EvidenceStatus = "planned" | "verified" | "committed" | "failed";

export type Dispositions = Record<string, { action: "import" | "rebuild" | "discard"; reason: string }>;

export interface TargetIdentity {
  environment: string;
  identity: string;
  database: string;
  nonce: string;
  manifestSha256: string;
}

export interface TargetIdentityExpectation {
  environment: string;
  identity: string;
  database: string;
  nonce: string;
  manifestSha256: string;
}

export interface ProductionPolicy {
  scope: string;
  version: number;
  dispositions: Dispositions;
  transformations: unknown;
}

export interface ForeignKey {
  table_name: string;
  column_name: string;
  parent_table: string;
  required: boolean;
}

export interface InsertDecision {
  values: Record<string, unknown>;
  deferred: Array<{ column: string; value: unknown }>;
  blocked: boolean;
}

export interface QueryClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface EvidenceInput {
  runId: string;
  mode: ImportMode;
  gitSha: string;
  sourceDeployment: string;
  targetEnvironment: string;
  targetIdentity: string;
  archiveHash: string;
  manifestHash: string;
  policyHash: string;
  planHash: string;
  startedAt: string;
  finishedAt?: string;
  sourceCounts: Record<string, number>;
  targetCounts?: Record<string, number>;
  rowsVerified: number;
  objectsVerified: number;
  idempotentReplay: boolean;
  status: EvidenceStatus;
  limitation?: string;
}

export interface PlanArtifact {
  version: 1;
  runId: string;
  planHash: string;
  sourceCounts: Record<string, number>;
  targetCounts: Record<string, number>;
  dispositions: Dispositions;
  objects: Array<{ id: string; key: string; size: number; sha256: string }>;
}

export const TARGET_TABLES: Record<string, AnyPgTable> = Object.fromEntries(
  (Object.values(schema) as unknown[])
    .filter((value): value is AnyPgTable => is(value, Table))
    .map((table) => [getTableName(table), table] as const),
);

export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function planDigest(plan: SnapshotPlan): string {
  return digest(plan);
}

export function parseArgs(argv: string[]): Map<string, string> {
  return new Map(argv.map((arg) => {
    const at = arg.indexOf("=");
    return [at < 0 ? arg : arg.slice(0, at), at < 0 ? "" : arg.slice(at + 1)];
  }));
}

export function requiredArg(args: Map<string, string>, name: string): string {
  const value = args.get(`--${name}`);
  if (!value) throw new Error(`MISSING_${name.toUpperCase().replaceAll("-", "_")}`);
  return value;
}

export function quoteIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("INVALID_SQL_IDENTIFIER");
  return `"${name}"`;
}

export function resolveImportMode(options: { apply: boolean; verify: boolean; planOnly: boolean }): ImportMode {
  const selected = Number(options.apply) + Number(options.verify) + Number(options.planOnly);
  if (selected > 1) throw new Error("INCOMPATIBLE_MODES");
  if (options.apply) return "apply";
  if (options.verify) return "verify";
  if (options.planOnly) return "plan-only";
  throw new Error("MODE_REQUIRED");
}

export function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error("INVALID_RUN_ID");
}

export function assertSourceDeployment(sourceDeployment: string): void {
  if (sourceDeployment !== PRODUCTION_SOURCE_DEPLOYMENT) throw new Error("SOURCE_NOT_ALLOWLISTED");
}

export function assertApplyApproval(env: Record<string, string | undefined>): void {
  if (env.PRODUCTION_IMPORT_APPROVED !== "true") throw new Error("PRODUCTION_IMPORT_NOT_APPROVED");
  if (env.LOBBYSTACK_MAINTENANCE_MODE !== "true") throw new Error("MAINTENANCE_MODE_REQUIRED");
}

export function assertHash(actual: string, expected: string, mismatchCode: string): void {
  if (!SHA256_PATTERN.test(expected) || actual !== expected) throw new Error(mismatchCode);
}

export function assertProductionTarget(value: string): string {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("PRODUCTION_TARGET_INVALID");
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("LOCAL_TARGET_NOT_PRODUCTION");
  if (url.search || url.hash) throw new Error("PRODUCTION_TARGET_INVALID");
  if (!["postgres", "lobbystack_migrator"].includes(decodeURIComponent(url.username))) throw new Error("MIGRATION_ROLE_REQUIRED");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || database.includes("/")) throw new Error("PRODUCTION_TARGET_INVALID");
  return database;
}

export function assertTargetIdentity(value: unknown, expected: TargetIdentityExpectation): TargetIdentity {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("TARGET_IDENTITY_FILE_INVALID");
  const identity = value as Record<string, unknown>;
  for (const key of ["environment", "identity", "database", "nonce", "manifestSha256"]) {
    const field = identity[key];
    if (typeof field !== "string" || !field.trim()) throw new Error("TARGET_IDENTITY_FILE_INVALID");
  }
  const parsed = identity as unknown as TargetIdentity;
  if (!SHA256_PATTERN.test(parsed.nonce) || !SHA256_PATTERN.test(parsed.manifestSha256)) throw new Error("TARGET_IDENTITY_FILE_INVALID");
  if (parsed.environment !== expected.environment) throw new Error("TARGET_ENVIRONMENT_MISMATCH");
  if (parsed.identity !== expected.identity) throw new Error("TARGET_IDENTITY_MISMATCH");
  if (parsed.database !== expected.database) throw new Error("TARGET_DATABASE_MISMATCH");
  if (parsed.manifestSha256 !== expected.manifestSha256) throw new Error("TARGET_MANIFEST_MISMATCH");
  if (parsed.nonce !== expected.nonce) throw new Error("TARGET_NONCE_MISMATCH");
  return parsed;
}

export function assertReviewedManifest(value: unknown, expected: { sourceDeployment: string; targetEnvironment: string; targetIdentity: string }): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("MANIFEST_INVALID");
  const manifest = value as Record<string, unknown>;
  if (manifest.version !== 1) throw new Error("MANIFEST_INVALID");
  const source = manifest.source as Record<string, unknown> | undefined;
  if (!source || source.deployment !== expected.sourceDeployment) throw new Error("MANIFEST_SOURCE_MISMATCH");
  const target = manifest.target as Record<string, unknown> | undefined;
  if (!target || target.environment !== expected.targetEnvironment || target.identity !== expected.targetIdentity) throw new Error("MANIFEST_TARGET_MISMATCH");
}

export function assertProductionPolicy(value: unknown, plan: SnapshotPlan): ProductionPolicy {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("POLICY_INVALID");
  const policy = value as Record<string, unknown>;
  if (policy.scope !== PRODUCTION_POLICY_SCOPE) throw new Error("POLICY_SCOPE_MISMATCH");
  if (policy.version !== 1) throw new Error("POLICY_VERSION_MISMATCH");
  if (canonical(policy.dispositions) !== canonical(plan.dispositions)) throw new Error("POLICY_DISPOSITION_MISMATCH");
  if (canonical(policy.transformations) !== canonical(REHEARSAL_TRANSFORMATIONS)) throw new Error("POLICY_TRANSFORMATION_MISMATCH");
  return policy as unknown as ProductionPolicy;
}

export function assertPlanConfirmed(plan: SnapshotPlan, confirmed: string): string {
  if (!SHA256_PATTERN.test(confirmed)) throw new Error("PLAN_HASH_NOT_CONFIRMED");
  const computed = planDigest(plan);
  if (confirmed !== computed) throw new Error("PLAN_HASH_NOT_CONFIRMED");
  return computed;
}

export function countRowsByTable(rows: PlannedRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.table] = (counts[row.table] ?? 0) + 1;
  return counts;
}

export function buildPlanArtifact(plan: SnapshotPlan, runId: string): PlanArtifact {
  return {
    version: 1,
    runId,
    planHash: planDigest(plan),
    sourceCounts: plan.sourceCounts,
    targetCounts: countRowsByTable(plan.rows),
    dispositions: plan.dispositions,
    objects: plan.objects.map(({ id, key, size, sha256 }) => ({ id, key, size, sha256 })),
  };
}

export function primaryKey(row: PlannedRow): Record<string, unknown> {
  if (row.values.id) return { id: row.values.id };
  if (row.table === "staff_service_assignments") return { staff_id: row.values.staff_id, service_id: row.values.service_id };
  throw new Error("UNSUPPORTED_PRIMARY_KEY");
}

export function prepareInsert(row: PlannedRow, foreignKeys: ForeignKey[], inserted: (key: string) => boolean): InsertDecision {
  const values = { ...row.values };
  const deferred: Array<{ column: string; value: unknown }> = [];
  let blocked = false;
  for (const key of foreignKeys) {
    if (key.table_name !== row.table) continue;
    const value = values[key.column_name];
    if (value == null || inserted(`${key.parent_table}:${value}`)) continue;
    if (key.required) blocked = true;
    else { deferred.push({ column: key.column_name, value }); values[key.column_name] = null; }
  }
  return { values, deferred, blocked };
}

export function readbackMismatch(row: PlannedRow, actual: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(row.values)) {
    if (value !== undefined && canonical(actual[key]) !== canonical(value)) return key;
  }
  return undefined;
}

export function lineageRowHash(row: PlannedRow): string {
  return digest({ values: row.values, legacyMetadata: row.legacyMetadata ?? {} });
}

export function buildEvidence(input: EvidenceInput): Record<string, unknown> {
  return {
    runId: input.runId,
    mode: input.mode,
    releaseCertified: false,
    gitSha: input.gitSha,
    sourceDeployment: input.sourceDeployment,
    targetEnvironment: input.targetEnvironment,
    targetIdentityHash: digest(input.targetIdentity),
    archiveHash: input.archiveHash,
    manifestHash: input.manifestHash,
    policyHash: input.policyHash,
    planHash: input.planHash,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt ?? null,
    sourceCounts: input.sourceCounts,
    targetCounts: input.targetCounts ?? {},
    rowsVerified: input.rowsVerified,
    objectsVerified: input.objectsVerified,
    idempotentReplay: input.idempotentReplay,
    status: input.status,
    owner: "UNASSIGNED",
    reviewer: "UNASSIGNED",
    ...(input.limitation ? { limitation: input.limitation } : {}),
  };
}

export async function verifyInventory(root: string, inventoryPath: string, expectedHash: string): Promise<void> {
  if (await fileDigest(inventoryPath) !== expectedHash) throw new Error("INVENTORY_HASH_MISMATCH");
  const manifest = JSON.parse(await readFile(inventoryPath, "utf8")) as { inventory?: Array<{ path: string; size: number; sha256: string }> };
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

export async function insertPlannedRows(client: QueryClient, rows: PlannedRow[], foreignKeys: ForeignKey[]): Promise<void> {
  const pending = [...rows];
  const inserted = new Set<string>();
  const deferred: Array<{ row: PlannedRow; column: string; value: unknown }> = [];
  while (pending.length) {
    let progress = false;
    for (let index = pending.length - 1; index >= 0; index--) {
      const row = pending[index]!;
      const decision = prepareInsert(row, foreignKeys, (key) => inserted.has(key));
      if (decision.blocked) continue;
      const columns = Object.keys(decision.values).filter((key) => decision.values[key] !== undefined);
      const types = Object.fromEntries(Object.values(getTableColumns(TARGET_TABLES[row.table]!)).map((column) => [column.name, column]));
      const params = columns.map((key) => types[key]?.dataType === "json" ? JSON.stringify(decision.values[key]) : decision.values[key]);
      try {
        await client.query(`INSERT INTO public.${quoteIdentifier(row.table)} (${columns.map(quoteIdentifier).join(",")}) VALUES (${params.map((_, i) => `$${i + 1}`).join(",")})`, params);
      } catch (error) {
        const code = (error as { code?: string }).code ?? "UNKNOWN";
        const constraint = (error as { constraint?: string }).constraint;
        throw new Error(`INSERT_REJECTED:${row.table}:${code}${constraint && /^[a-z0-9_]+$/.test(constraint) ? `:${constraint}` : ""}`);
      }
      for (const item of decision.deferred) deferred.push({ row, column: item.column, value: item.value });
      if (decision.values.id) inserted.add(`${row.table}:${decision.values.id}`);
      pending.splice(index, 1);
      progress = true;
    }
    if (!progress) throw new Error(`UNRESOLVED_INSERT_DEPENDENCIES:${[...new Set(pending.map((row) => row.table))].join(",")}`);
  }
  for (const item of deferred) {
    const keys = Object.entries(primaryKey(item.row));
    await client.query(`UPDATE public.${quoteIdentifier(item.row.table)} SET ${quoteIdentifier(item.column)}=$1 WHERE ${keys.map(([key], i) => `${quoteIdentifier(key)}=$${i + 2}`).join(" AND ")}`, [item.value, ...keys.map(([, value]) => value)]);
  }
}

export async function verifyPlannedRows(client: QueryClient, rows: PlannedRow[], rerun: boolean): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const keys = Object.entries(primaryKey(row));
    const readback = await client.query(`SELECT * FROM public.${quoteIdentifier(row.table)} WHERE ${keys.map(([key], i) => `${quoteIdentifier(key)}=$${i + 1}`).join(" AND ")}`, keys.map(([, value]) => value));
    if (readback.rows.length !== 1) throw new Error(`READBACK_MISSING:${row.table}`);
    const mismatch = readbackMismatch(row, readback.rows[0]!);
    if (mismatch) throw new Error(`READBACK_MISMATCH:${row.table}:${mismatch}`);
    counts[row.table] = (counts[row.table] ?? 0) + 1;
    const rowHash = lineageRowHash(row);
    const key = JSON.stringify(primaryKey(row));
    if (!rerun) await client.query("INSERT INTO migration_control.lineage VALUES ($1,$2,$3,$4,$5,$6)", [row.table, key, row.sourceTable, row.sourceId, rowHash, JSON.stringify(row.legacyMetadata ?? {})]);
    else {
      const lineage = await client.query("SELECT source_table,source_id,row_hash,legacy_metadata FROM migration_control.lineage WHERE target_table=$1 AND target_key=$2", [row.table, key]);
      if (lineage.rows.length !== 1 || lineage.rows[0]!.source_table !== row.sourceTable || lineage.rows[0]!.source_id !== row.sourceId || lineage.rows[0]!.row_hash !== rowHash || canonical(lineage.rows[0]!.legacy_metadata) !== canonical(row.legacyMetadata ?? {})) throw new Error(`LINEAGE_MISMATCH:${row.table}`);
    }
  }
  return counts;
}
