import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { type AnyPgTable } from "drizzle-orm/pg-core";
import * as schema from "../../packages/db/src/schema/index.ts";
import { canonical } from "./rehearsal-import.ts";
import {
  assertSourceAccounting,
  compileSnapshot,
  IMPORT_TABLES,
  REHEARSAL_TRANSFORMATIONS,
  type PlannedRow,
  type SnapshotPlan,
} from "./snapshot-plan.ts";
import { readSnapshot } from "./snapshot-plan-check.ts";
import { fileDigest, inspectStorage, verifyLocalObjects } from "./snapshot-storage.ts";

// ---------------------------------------------------------------------------
// Pure comparison core
//
// Everything in this section operates on plain values only. It never touches a
// database, filesystem, environment, or clock, so it can be unit-tested without
// infrastructure. Issues carry codes, table/column identifiers, and aggregate
// counts only; customer values and record identities are never included.
// ---------------------------------------------------------------------------

export interface ReconciliationIssue {
  code: string;
  table?: string;
  field?: string;
  count?: number;
  detail?: string;
}

export function makeIssue(
  code: string,
  options: { table?: string; field?: string; count?: number; detail?: string } = {},
): ReconciliationIssue {
  const issue: ReconciliationIssue = { code };
  if (options.table !== undefined) issue.table = options.table;
  if (options.field !== undefined) issue.field = options.field;
  if (options.count !== undefined) issue.count = options.count;
  if (options.detail !== undefined) issue.detail = options.detail;
  return issue;
}

export function formatIssueCode(issue: ReconciliationIssue): string {
  const suffix = [issue.table, issue.field].filter((value): value is string => typeof value === "string" && value.length > 0);
  return suffix.length ? `${issue.code}:${suffix.join(":")}` : issue.detail ? `${issue.code}:${issue.detail}` : issue.code;
}

/** `null` values mark a key-only row (existence known, field content not read). */
export interface ComparableRow {
  key: string;
  values: Record<string, unknown> | null;
}

export interface TableComparisonInput {
  table: string;
  expected: ComparableRow[];
  actual: ComparableRow[];
  fields: string[];
}

export interface TableComparisonResult {
  table: string;
  expectedCount: number;
  actualCount: number;
  matchedCount: number;
  missingCount: number;
  extraCount: number;
  duplicateExpectedCount: number;
  duplicateActualCount: number;
  fieldMismatch: Record<string, number>;
  comparedRows: number;
  issues: ReconciliationIssue[];
}

/** PostgreSQL drivers return timestamps as `Date`; planned values use ISO text. */
export function normalizeTargetValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function comparableValues(expected: unknown, actual: unknown): boolean {
  return canonical(expected) === canonical(normalizeTargetValue(actual));
}

/** Deterministic, order-independent sample used for large tables. */
export function selectSampleKeys(keys: string[], limit: number): string[] {
  const sorted = [...keys].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (limit <= 0 || sorted.length <= limit) return sorted;
  const sample: string[] = [];
  const step = sorted.length / limit;
  for (let index = 0; index < limit; index += 1) sample.push(sorted[Math.floor(index * step)]!);
  return sample;
}

export function compareTableRows(input: TableComparisonInput): TableComparisonResult {
  const { table, expected, actual, fields } = input;
  const expectedByKey = new Map<string, ComparableRow>();
  const expectedDuplicates = new Set<string>();
  for (const row of expected) {
    if (expectedByKey.has(row.key)) expectedDuplicates.add(row.key);
    else expectedByKey.set(row.key, row);
  }
  const actualByKey = new Map<string, ComparableRow>();
  const actualDuplicates = new Set<string>();
  for (const row of actual) {
    if (actualByKey.has(row.key)) actualDuplicates.add(row.key);
    else actualByKey.set(row.key, row);
  }
  const issues: ReconciliationIssue[] = [];
  if (expected.length !== actual.length) {
    issues.push(makeIssue("ROW_COUNT_MISMATCH", { table, count: Math.abs(expected.length - actual.length) }));
  }
  let missing = 0;
  let matched = 0;
  for (const key of expectedByKey.keys()) {
    if (actualByKey.has(key)) matched += 1;
    else missing += 1;
  }
  let extra = 0;
  for (const key of actualByKey.keys()) if (!expectedByKey.has(key)) extra += 1;
  if (missing > 0) issues.push(makeIssue("MISSING_LEGACY_ID", { table, count: missing }));
  if (extra > 0) issues.push(makeIssue("EXTRA_LEGACY_ID", { table, count: extra }));
  if (expectedDuplicates.size > 0) issues.push(makeIssue("DUPLICATE_EXPECTED_ID", { table, count: expectedDuplicates.size }));
  if (actualDuplicates.size > 0) issues.push(makeIssue("DUPLICATE_LEGACY_ID", { table, count: actualDuplicates.size }));

  const fieldMismatch: Record<string, number> = {};
  let compared = 0;
  for (const [key, expectedRow] of expectedByKey) {
    const actualRow = actualByKey.get(key);
    if (!expectedRow.values || !actualRow || !actualRow.values) continue;
    compared += 1;
    for (const field of fields) {
      const expectedValue = expectedRow.values[field];
      if (expectedValue === undefined) continue;
      if (!comparableValues(expectedValue, actualRow.values[field])) {
        fieldMismatch[field] = (fieldMismatch[field] ?? 0) + 1;
      }
    }
  }
  for (const [field, count] of Object.entries(fieldMismatch)) {
    issues.push(makeIssue("FIELD_MISMATCH", { table, field, count }));
  }
  return {
    table,
    expectedCount: expected.length,
    actualCount: actual.length,
    matchedCount: matched,
    missingCount: missing,
    extraCount: extra,
    duplicateExpectedCount: expectedDuplicates.size,
    duplicateActualCount: actualDuplicates.size,
    fieldMismatch,
    comparedRows: compared,
    issues,
  };
}

export interface ForeignKeyObservation {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  orphanCount: number;
}

export function evaluateForeignKeys(observations: ForeignKeyObservation[]): ReconciliationIssue[] {
  return observations
    .filter((observation) => observation.orphanCount > 0)
    .map((observation) => makeIssue("ORPHAN_FOREIGN_KEY", { table: observation.childTable, field: observation.childColumn, count: observation.orphanCount }));
}

export interface TransformObservation {
  name: string;
  violations: number;
}

export function evaluateTransforms(observations: TransformObservation[]): ReconciliationIssue[] {
  return observations
    .filter((observation) => observation.violations > 0)
    .map((observation) => makeIssue("TRANSFORM_VIOLATION", { detail: observation.name, count: observation.violations }));
}

export interface AggregateGroup {
  key: string;
  values: Record<string, number>;
}

export interface AggregateComparisonResult {
  table: string;
  expectedGroups: number;
  actualGroups: number;
  missingGroups: number;
  extraGroups: number;
  fieldMismatch: Record<string, number>;
  issues: ReconciliationIssue[];
}

export function compareAggregates(
  table: string,
  expected: AggregateGroup[],
  actual: AggregateGroup[],
  fields: string[],
  tolerance = 1e-6,
): AggregateComparisonResult {
  const expectedByKey = new Map(expected.map((group) => [group.key, group]));
  const actualByKey = new Map(actual.map((group) => [group.key, group]));
  let missingGroups = 0;
  let extraGroups = 0;
  for (const key of expectedByKey.keys()) if (!actualByKey.has(key)) missingGroups += 1;
  for (const key of actualByKey.keys()) if (!expectedByKey.has(key)) extraGroups += 1;
  const fieldMismatch: Record<string, number> = {};
  for (const [key, expectedGroup] of expectedByKey) {
    const actualGroup = actualByKey.get(key);
    if (!actualGroup) continue;
    for (const field of fields) {
      const left = expectedGroup.values[field] ?? 0;
      const right = actualGroup.values[field] ?? 0;
      if (Math.abs(left - right) > tolerance * Math.max(1, Math.abs(left), Math.abs(right))) {
        fieldMismatch[field] = (fieldMismatch[field] ?? 0) + 1;
      }
    }
  }
  const issues: ReconciliationIssue[] = [];
  if (missingGroups > 0) issues.push(makeIssue("AGGREGATE_GROUP_MISSING", { table, count: missingGroups }));
  if (extraGroups > 0) issues.push(makeIssue("AGGREGATE_GROUP_EXTRA", { table, count: extraGroups }));
  for (const [field, count] of Object.entries(fieldMismatch)) issues.push(makeIssue("AGGREGATE_MISMATCH", { table, field, count }));
  return { table, expectedGroups: expected.length, actualGroups: actual.length, missingGroups, extraGroups, fieldMismatch, issues };
}

export interface PresenceObservation {
  name: string;
  actual: number;
  expected?: number;
  expectPositive?: boolean;
}

export function evaluatePresence(observations: PresenceObservation[]): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  for (const observation of observations) {
    if (observation.expected !== undefined && observation.actual !== observation.expected) {
      issues.push(makeIssue("DERIVED_COUNT_MISMATCH", { detail: observation.name, count: Math.abs(observation.actual - observation.expected) }));
    } else if (observation.expectPositive && observation.actual === 0) {
      issues.push(makeIssue("DERIVED_DATA_MISSING", { detail: observation.name }));
    }
  }
  return issues;
}

const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function isValidRunId(value: unknown): value is string {
  return typeof value === "string" && RUN_ID_PATTERN.test(value);
}

export function isValidSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

export const ALLOWED_READ_ONLY_ROLES = ["lobbystack_readonly", "lobbystack_migrator", "postgres"] as const;

export function isAllowedReadOnlyRole(value: unknown): value is string {
  return typeof value === "string" && (ALLOWED_READ_ONLY_ROLES as readonly string[]).includes(value);
}

export function databaseIdentityMatches(actual: unknown, expected: string): boolean {
  return typeof actual === "string" && actual === expected;
}

// ---------------------------------------------------------------------------
// CLI / database I/O
// ---------------------------------------------------------------------------

const TARGET_NAMES: Record<string, string> = { authAccounts: "accounts", _storage: "storage_objects", appointment_change_audit_logs: "audit_logs" };
const SMALL_TABLE_LIMIT = 500;
const SAMPLE_LIMIT = 100;
const EXPECTED_INDEXES = ["knowledge_documents_title_keyword_idx", "knowledge_chunks_keyword_idx", "knowledge_chunks_embedding_hnsw_idx"];
const BLOCKING_CODES = new Set([
  "MANIFEST_DIGEST_MISMATCH",
  "INVALID_MANIFEST_VERSION",
  "RUN_ID_MISMATCH",
  "PLAN_ISSUE",
  "RECONCILIATION_BLOCKED",
  "DATABASE_NAME_MISMATCH",
  "ROLE_NOT_ALLOWED",
  "REPORT_WRITE_FAILED",
]);

type ColumnInfo = { name: string; columnType?: string; dataType?: string; notNull?: boolean; hasDefault?: boolean };
type Columns = Record<string, ColumnInfo | undefined>;

const schemaTables: Record<string, AnyPgTable> = Object.fromEntries(
  (Object.values(schema) as unknown[])
    .filter((value): value is AnyPgTable => is(value, Table))
    .map((table) => [getTableName(table), table]),
);

const AGGREGATE_SPECS: Array<{ table: string; groupBy: string[]; sums: string[]; counts: string[] }> = [
  { table: "billing_transactions", groupBy: ["kind", "status", "currency"], sums: ["amount_cents"], counts: [] },
  { table: "billing_usage_events", groupBy: ["usage_kind"], sums: ["quantity", "billable_quantity"], counts: ["is_final"] },
  {
    table: "billing_usage_months",
    groupBy: ["business_id", "period_key"],
    sums: ["voice_seconds_used", "alert_sms_segments_used", "outbound_call_attempts_used", "chat_ai_tokens_used", "overage_spend_cents"],
    counts: ["voice_blocked", "alert_sms_blocked", "outbound_call_attempts_blocked", "chat_ai_blocked"],
  },
  { table: "unit_economics_events", groupBy: ["event_kind"], sums: ["cost_usd"], counts: [] },
  { table: "affiliate_commissions", groupBy: ["status", "currency"], sums: ["commission_cents", "amount_cents"], counts: [] },
  { table: "affiliate_payout_runs", groupBy: ["status", "currency"], sums: ["total_cents"], counts: [] },
  { table: "affiliate_voided_sources", groupBy: ["status", "currency"], sums: ["amount_cents"], counts: [] },
];

// Every check returns the number of violating rows. Fixed constants and
// identifiers are safe to embed; no customer value is selected or printed.
const TRANSFORM_CHECKS: Array<{ name: string; sql: string }> = [
  { name: "calendar_disconnected", sql: `SELECT count(*)::int AS count FROM public."calendar_connections" WHERE status <> 'disconnected' OR encrypted_access_token IS NOT NULL OR encrypted_refresh_token IS NOT NULL` },
  { name: "inbox_resolved_mapped", sql: `SELECT count(*)::int AS count FROM public."inbox_items" WHERE status = 'resolved'` },
  { name: "inbox_scrubbed_redacted", sql: `SELECT count(*)::int AS count FROM public."inbox_items" WHERE content_retention_status = 'scrubbed' AND body <> '[Expired by 365-day retention policy]'` },
  { name: "knowledge_chunks_pending", sql: `SELECT count(*)::int AS count FROM public."knowledge_chunks" WHERE embedding_status <> 'pending' OR embedding IS NOT NULL OR embedding_fingerprint IS NOT NULL` },
  { name: "number_claims_audit_only", sql: `SELECT count(*)::int AS count FROM public."onboarding_number_claim_events"` },
  { name: "notification_expiry_derived", sql: `SELECT count(*)::int AS count FROM public."operator_notification_deliveries" WHERE content_expires_at < created_at` },
  { name: "notification_unsendable_held", sql: `SELECT count(*)::int AS count FROM public."operator_notification_deliveries" WHERE destination = '' AND status = 'pending'` },
  { name: "call_transport_default", sql: `SELECT count(*)::int AS count FROM public."calls" WHERE transport IS NULL OR transport = ''` },
  { name: "onboarding_stage_mapped", sql: `SELECT count(*)::int AS count FROM public."businesses" WHERE onboarding_stage = 'completed'` },
  { name: "sessions_discarded", sql: `SELECT count(*)::int AS count FROM public."sessions"` },
  { name: "credentials_preserved", sql: `SELECT count(*)::int AS count FROM public."accounts" WHERE provider_id = 'credential' AND password IS NULL` },
];

interface PgClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

interface CliOptions {
  exportRoot: string;
  manifestPath: string;
  expectedManifestSha256: string;
  database: string;
  reportPath: string;
  runId: string;
  objectsRoot?: string;
  allowOutbox: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  let allowOutbox = false;
  for (const argument of argv) {
    if (argument === "--allow-outbox") {
      allowOutbox = true;
      continue;
    }
    if (!argument.startsWith("--")) continue;
    const at = argument.indexOf("=");
    if (at < 0) continue;
    args.set(argument.slice(2, at), argument.slice(at + 1));
  }
  const required = (name: string): string => {
    const value = args.get(name);
    if (!value) throw new Error(`MISSING_ARG:${name.toUpperCase().replaceAll("-", "_")}`);
    return value;
  };
  const options: CliOptions = {
    exportRoot: required("export"),
    manifestPath: required("manifest"),
    expectedManifestSha256: required("expected-manifest-sha256"),
    database: required("database"),
    reportPath: required("report"),
    runId: required("run-id"),
    allowOutbox,
  };
  const objectsRoot = args.get("objects");
  if (objectsRoot) options.objectsRoot = objectsRoot;
  return options;
}

function quoteIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("INVALID_SQL_IDENTIFIER");
  return `"${name}"`;
}

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z_]+(?::[a-zA-Z0-9_,]+)*$/.test(error.message)) return error.message;
  // Surface only the stable SQLSTATE (e.g. 42P01), never the message, which can
  // contain identifiers or values.
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return `RECONCILIATION_BLOCKED:PG_${code}`;
  return "RECONCILIATION_BLOCKED_REDACTED";
}

async function writePrivateReport(path: string, evidence: Record<string, unknown>): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function scalarCount(client: PgClient, text: string, values?: unknown[]): Promise<number> {
  const result = await client.query(text, values);
  const raw = result.rows[0]?.count;
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

function columnsFor(target: AnyPgTable): Columns {
  return getTableColumns(target) as unknown as Columns;
}

function expectedRowKey(row: PlannedRow, columns: Columns): string {
  if (columns.legacyConvexId) return row.sourceId;
  if (columns.id) return String(row.values.id ?? row.sourceId);
  if (columns.staffId && columns.serviceId) return `${String(row.values.staff_id)}:${String(row.values.service_id)}`;
  return row.sourceId;
}

interface KeyPlan {
  expr: string;
  where: string;
  actualKey: (row: Record<string, unknown>) => string;
}

function keyPlan(table: string, columns: Columns): KeyPlan {
  if (columns.legacyConvexId) {
    return { expr: quoteIdentifier("legacy_convex_id"), where: `${quoteIdentifier("legacy_convex_id")} IS NOT NULL`, actualKey: (row) => String(row.legacy_convex_id) };
  }
  if (columns.id) {
    return { expr: quoteIdentifier("id"), where: "TRUE", actualKey: (row) => String(row.id) };
  }
  if (columns.staffId && columns.serviceId) {
    return {
      expr: `${quoteIdentifier("staff_id")}::text || ':' || ${quoteIdentifier("service_id")}::text`,
      where: `${quoteIdentifier("staff_id")} IS NOT NULL AND ${quoteIdentifier("service_id")} IS NOT NULL`,
      actualKey: (row) => `${String(row.staff_id)}:${String(row.service_id)}`,
    };
  }
  throw new Error(`UNSUPPORTED_KEY:${table}`);
}

/**
 * Target tables that must be reconciled: every source-mapped table plus every
 * table the plan actually writes, which includes plan-generated tables such as
 * freshly derived knowledge chunks.
 */
export function reconcileTargetTables(
  importTables: readonly string[],
  targetNames: Readonly<Record<string, string>>,
  plannedTables: Iterable<string>,
): string[] {
  const tables: string[] = [];
  for (const sourceTable of importTables) {
    const target = targetNames[sourceTable] ?? sourceTable;
    if (!tables.includes(target)) tables.push(target);
  }
  for (const table of plannedTables) if (!tables.includes(table)) tables.push(table);
  return tables;
}

function activeAggregateFields(spec: { sums: string[]; counts: string[] }, rows: PlannedRow[]): { sums: string[]; counts: string[] } {
  const present = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row.values)) if (row.values[key] !== undefined) present.add(key);
  return { sums: spec.sums.filter((field) => present.has(field)), counts: spec.counts.filter((field) => present.has(field)) };
}

function expectedAggregates(rows: PlannedRow[], groupBy: string[], sums: string[], counts: string[]): AggregateGroup[] {
  const groups = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const key = groupBy.map((field) => String(row.values[field] ?? "")).join("\u0000");
    const values = groups.get(key) ?? {};
    groups.set(key, values);
    for (const field of sums) {
      const value = row.values[field];
      values[field] = (values[field] ?? 0) + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }
    for (const field of counts) if (row.values[field] === true) values[field] = (values[field] ?? 0) + 1;
  }
  return [...groups.entries()].map(([key, values]) => ({ key, values }));
}

async function actualAggregates(client: PgClient, table: string, groupBy: string[], sums: string[], counts: string[]): Promise<AggregateGroup[]> {
  const selection = [
    ...groupBy.map((field) => `${quoteIdentifier(field)}::text AS ${quoteIdentifier(field)}`),
    ...sums.map((field) => `coalesce(sum(${quoteIdentifier(field)}), 0)::float8 AS ${quoteIdentifier(field)}`),
    ...counts.map((field) => `coalesce(sum(CASE WHEN ${quoteIdentifier(field)} THEN 1 ELSE 0 END), 0)::float8 AS ${quoteIdentifier(field)}`),
  ].join(", ");
  const grouping = groupBy.map(quoteIdentifier).join(", ");
  const result = await client.query(`SELECT ${selection} FROM public.${quoteIdentifier(table)} GROUP BY ${grouping}`);
  const fields = [...sums, ...counts];
  return result.rows.map((row) => {
    const key = groupBy.map((field) => String(row[field] ?? "")).join("\u0000");
    const values: Record<string, number> = {};
    for (const field of fields) values[field] = Number(row[field] ?? 0);
    return { key, values };
  });
}

async function readForeignKeys(client: PgClient): Promise<Array<{ childTable: string; childColumn: string; parentTable: string; parentColumn: string }>> {
  const result = await client.query(`
    SELECT child.relname AS child_table, a.attname AS child_column, parent.relname AS parent_table, pa.attname AS parent_column
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_attribute a ON a.attrelid = child.oid AND a.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND n.nspname = 'public' AND cardinality(c.conkey) = 1
  `);
  const keys: Array<{ childTable: string; childColumn: string; parentTable: string; parentColumn: string }> = [];
  for (const row of result.rows) {
    const { child_table, child_column, parent_table, parent_column } = row;
    if (typeof child_table !== "string" || typeof child_column !== "string" || typeof parent_table !== "string" || typeof parent_column !== "string") continue;
    keys.push({ childTable: child_table, childColumn: child_column, parentTable: parent_table, parentColumn: parent_column });
  }
  return keys;
}

async function readIndexes(client: PgClient): Promise<Array<{ name: string; method: string; definition: string }>> {
  const result = await client.query(`
    SELECT i.relname AS name, am.amname AS method, pg_get_indexdef(i.oid) AS definition
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_am am ON am.oid = i.relam
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
  `);
  const indexes: Array<{ name: string; method: string; definition: string }> = [];
  for (const row of result.rows) {
    if (typeof row.name !== "string" || typeof row.method !== "string" || typeof row.definition !== "string") continue;
    indexes.push({ name: row.name, method: row.method, definition: row.definition });
  }
  return indexes;
}

async function relationExists(client: PgClient, table: string): Promise<boolean> {
  const result = await client.query(`SELECT to_regclass($1) AS relation`, [`public.${table}`]);
  return result.rows[0]?.relation != null;
}

interface ReconcileContext {
  client: PgClient;
  byTarget: Map<string, PlannedRow[]>;
  issues: ReconciliationIssue[];
  tables: Array<Record<string, unknown>>;
  checks: Array<Record<string, unknown>>;
  aggregates: Array<Record<string, unknown>>;
  sampledRows: number;
}

async function reconcileImportTables(context: ReconcileContext): Promise<void> {
  const { client, byTarget, issues, tables } = context;
  const targetSet = reconcileTargetTables(IMPORT_TABLES, TARGET_NAMES, byTarget.keys());
  for (const table of targetSet) {
    const target = schemaTables[table];
    if (!target) {
      issues.push(makeIssue("MISSING_TARGET_TABLE", { table }));
      continue;
    }
    const columns = columnsFor(target);
    const plannedRows = byTarget.get(table) ?? [];
    const keys = keyPlan(table, columns);
    const fields = new Set<string>();
    for (const row of plannedRows) for (const key of Object.keys(row.values)) if (row.values[key] !== undefined) fields.add(key);
    const expected: ComparableRow[] = plannedRows.map((row) => ({ key: expectedRowKey(row, columns), values: row.values }));

    const actualCount = await scalarCount(client, `SELECT count(*)::int AS count FROM public.${quoteIdentifier(table)}`);
    let actual: ComparableRow[] = [];
    if (actualCount > 0) {
      if (actualCount <= SMALL_TABLE_LIMIT) {
        const rows = (await client.query(`SELECT * FROM public.${quoteIdentifier(table)}`)).rows;
        actual = rows.map((row) => ({ key: keys.actualKey(row), values: row }));
      } else {
        const keyRows = (await client.query(`SELECT ${keys.expr} AS key FROM public.${quoteIdentifier(table)} WHERE ${keys.where}`)).rows;
        const sampleKeys = selectSampleKeys(expected.map((row) => row.key), SAMPLE_LIMIT);
        const fullRows = sampleKeys.length
          ? (await client.query(`SELECT * FROM public.${quoteIdentifier(table)} WHERE (${keys.expr})::text = ANY($1::text[])`, [sampleKeys])).rows
          : [];
        const fullByKey = new Map<string, Record<string, unknown>>();
        for (const row of fullRows) fullByKey.set(keys.actualKey(row), row);
        actual = keyRows.map((row) => {
          const key = String(row.key);
          return { key, values: fullByKey.get(key) ?? null };
        });
      }
    }
    const comparison = compareTableRows({ table, expected, actual, fields: [...fields] });
    for (const issue of comparison.issues) issues.push(issue);
    context.sampledRows += comparison.comparedRows;
    tables.push({
      table,
      expected: comparison.expectedCount,
      actual: comparison.actualCount,
      matched: comparison.matchedCount,
      missing: comparison.missingCount,
      extra: comparison.extraCount,
      duplicateExpected: comparison.duplicateExpectedCount,
      duplicateActual: comparison.duplicateActualCount,
      fieldMismatch: comparison.fieldMismatch,
      compared: comparison.comparedRows,
    });
  }
}

async function verifyStorage(plan: SnapshotPlan, options: CliOptions, context: ReconcileContext): Promise<number> {
  if (options.objectsRoot) {
    try {
      await verifyLocalObjects(resolve(options.objectsRoot), plan.objects);
    } catch (error) {
      context.issues.push(makeIssue("STORAGE_VERIFICATION_FAILED", { detail: safeErrorCode(error) }));
    }
  }
  const expectedKeys = new Set(plan.objects.map((object) => object.key));
  const targetRows = context.byTarget.get("storage_objects") ?? [];
  const actualKeys = new Set(targetRows.map((row) => String(row.values.object_key ?? "")));
  let missing = 0;
  let extra = 0;
  for (const key of expectedKeys) if (!actualKeys.has(key)) missing += 1;
  for (const key of actualKeys) if (!expectedKeys.has(key)) extra += 1;
  if (missing > 0) context.issues.push(makeIssue("STORAGE_OBJECT_MISSING", { table: "storage_objects", count: missing }));
  if (extra > 0) context.issues.push(makeIssue("STORAGE_OBJECT_EXTRA", { table: "storage_objects", count: extra }));
  context.checks.push({ storage: { expectedObjects: plan.objects.length, targetRows: targetRows.length, missing, extra, localVerified: Boolean(options.objectsRoot) } });
  return options.objectsRoot ? plan.objects.length : 0;
}

async function reconcileAggregates(context: ReconcileContext): Promise<void> {
  for (const spec of AGGREGATE_SPECS) {
    const rows = context.byTarget.get(spec.table) ?? [];
    const fields = activeAggregateFields(spec, rows);
    if (fields.sums.length === 0 && fields.counts.length === 0) continue;
    const expected = expectedAggregates(rows, spec.groupBy, fields.sums, fields.counts);
    let actual: AggregateGroup[] = [];
    try {
      actual = await actualAggregates(context.client, spec.table, spec.groupBy, fields.sums, fields.counts);
    } catch (error) {
      context.issues.push(makeIssue("AGGREGATE_QUERY_FAILED", { table: spec.table, detail: safeErrorCode(error) }));
      continue;
    }
    const comparison = compareAggregates(spec.table, expected, actual, [...fields.sums, ...fields.counts]);
    for (const issue of comparison.issues) context.issues.push(issue);
    context.aggregates.push({
      table: spec.table,
      expectedGroups: comparison.expectedGroups,
      actualGroups: comparison.actualGroups,
      missingGroups: comparison.missingGroups,
      extraGroups: comparison.extraGroups,
      fieldMismatch: comparison.fieldMismatch,
    });
  }
}

async function reconcileTransformations(context: ReconcileContext): Promise<void> {
  const observations: TransformObservation[] = [];
  for (const check of TRANSFORM_CHECKS) {
    try {
      observations.push({ name: check.name, violations: await scalarCount(context.client, check.sql) });
    } catch (error) {
      context.issues.push(makeIssue("TRANSFORM_QUERY_FAILED", { detail: `${check.name}:${safeErrorCode(error)}` }));
    }
  }
  for (const issue of evaluateTransforms(observations)) context.issues.push(issue);
  context.checks.push({ transformations: observations.map((observation) => ({ name: observation.name, violations: observation.violations })) });
}

async function reconcileReferentialIntegrity(context: ReconcileContext): Promise<void> {
  const foreignKeys = await readForeignKeys(context.client);
  const observations: ForeignKeyObservation[] = [];
  for (const key of foreignKeys) {
    try {
      const orphanCount = await scalarCount(
        context.client,
        `SELECT count(*)::int AS count FROM public.${quoteIdentifier(key.childTable)} child LEFT JOIN public.${quoteIdentifier(key.parentTable)} parent ON parent.${quoteIdentifier(key.parentColumn)} = child.${quoteIdentifier(key.childColumn)} WHERE child.${quoteIdentifier(key.childColumn)} IS NOT NULL AND parent.${quoteIdentifier(key.parentColumn)} IS NULL`,
      );
      observations.push({ childTable: key.childTable, childColumn: key.childColumn, parentTable: key.parentTable, parentColumn: key.parentColumn, orphanCount });
    } catch (error) {
      context.issues.push(makeIssue("FOREIGN_KEY_QUERY_FAILED", { table: key.childTable, field: key.childColumn, detail: safeErrorCode(error) }));
    }
  }
  for (const issue of evaluateForeignKeys(observations)) context.issues.push(issue);
  context.checks.push({ foreignKeys: { checked: observations.length, orphans: observations.filter((observation) => observation.orphanCount > 0).length } });
}

async function reconcileDerivedPresence(context: ReconcileContext): Promise<void> {
  const { client, issues } = context;
  const observations: PresenceObservation[] = [];
  const businesses = await scalarCount(client, `SELECT count(*)::int AS count FROM public."businesses"`);
  observations.push({ name: "business_context_snapshots", actual: await scalarCount(client, `SELECT count(*)::int AS count FROM public."business_context_snapshots"`), expected: businesses });
  const profiles = await scalarCount(client, `SELECT count(*)::int AS count FROM public."affiliate_profiles"`);
  observations.push({ name: "affiliate_profile_stats", actual: await scalarCount(client, `SELECT count(*)::int AS count FROM public."affiliate_profile_stats"`), expected: profiles });
  const unitEvents = await scalarCount(client, `SELECT count(*)::int AS count FROM public."unit_economics_events"`);
  observations.push({ name: "unit_economics_rollups", actual: await scalarCount(client, `SELECT count(*)::int AS count FROM public."unit_economics_rollups"`), ...(unitEvents > 0 ? { expectPositive: true } : {}) });
  observations.push({ name: "calendar_busy_blocks", actual: await scalarCount(client, `SELECT count(*)::int AS count FROM public."calendar_busy_blocks"`) });
  for (const optional of ["sms_consent_states", "auth_email_claims", "user_email_claims"]) {
    if (await relationExists(client, optional)) {
      observations.push({ name: optional, actual: await scalarCount(client, `SELECT count(*)::int AS count FROM public.${quoteIdentifier(optional)}`) });
    }
  }
  for (const issue of evaluatePresence(observations)) issues.push(issue);
  context.checks.push({ derivedPresence: observations.map((observation) => ({ name: observation.name, actual: observation.actual, expected: observation.expected ?? null })) });
}

async function reconcileOperationalState(context: ReconcileContext, allowOutbox: boolean): Promise<void> {
  const providerEvents = await scalarCount(context.client, `SELECT count(*)::int AS count FROM public."provider_events"`);
  const outboxMessages = await scalarCount(context.client, `SELECT count(*)::int AS count FROM public."outbox_messages"`);
  if (providerEvents > 0) context.issues.push(makeIssue("PROVIDER_EVENTS_PRESENT", { table: "provider_events", count: providerEvents }));
  if (outboxMessages > 0 && !allowOutbox) context.issues.push(makeIssue("OUTBOX_NOT_EMPTY", { table: "outbox_messages", count: outboxMessages }));
  context.checks.push({ operationalState: { providerEvents, outboxMessages } });
}

async function reconcileIndexes(context: ReconcileContext): Promise<void> {
  const indexes = await readIndexes(context.client);
  const names = new Set(indexes.map((index) => index.name));
  const hasTsvector = indexes.some((index) => index.method === "gin" && index.definition.includes("to_tsvector"));
  const hasVector = indexes.some((index) => index.method === "hnsw" || index.method === "ivfflat");
  for (const expected of EXPECTED_INDEXES) if (!names.has(expected)) context.issues.push(makeIssue("MISSING_INDEX", { detail: expected }));
  if (!hasTsvector) context.issues.push(makeIssue("MISSING_INDEX", { detail: "tsvector_gin" }));
  if (!hasVector) context.issues.push(makeIssue("MISSING_INDEX", { detail: "vector_ann" }));
  context.checks.push({ indexes: { expected: EXPECTED_INDEXES.length, present: indexes.filter((index) => EXPECTED_INDEXES.includes(index.name)).length, tsvector: hasTsvector, vector: hasVector } });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!isValidRunId(options.runId)) throw new Error("INVALID_RUN_ID");
  if (!isValidSha256(options.expectedManifestSha256)) throw new Error("INVALID_EXPECTED_MANIFEST_SHA256");

  const startedAt = new Date().toISOString();
  const issues: ReconciliationIssue[] = [];
  const perTable: Array<Record<string, unknown>> = [];
  const aggregates: Array<Record<string, unknown>> = [];
  const checks: Array<Record<string, unknown>> = [];
  let planHash = "unknown";
  let manifestHash = "unknown";
  let databaseName: string | null = null;
  let role: string | null = null;
  let expectedRows = 0;
  let expectedObjects = 0;
  let actualRows = 0;
  let sampledRows = 0;
  let objectsVerified = 0;
  let status: "passed" | "failed" | "blocked" = "blocked";

  try {
    const databaseUrl = process.env.RECONCILIATION_DATABASE_URL;
    if (!databaseUrl) throw new Error("RECONCILIATION_DATABASE_URL_REQUIRED");

    manifestHash = await fileDigest(options.manifestPath);
    if (manifestHash !== options.expectedManifestSha256.toLowerCase()) {
      issues.push(makeIssue("MANIFEST_DIGEST_MISMATCH"));
    } else {
      try {
        const manifest = JSON.parse(await readFile(options.manifestPath, "utf8")) as { version?: unknown; runId?: unknown };
        if (manifest.version !== 1) issues.push(makeIssue("INVALID_MANIFEST_VERSION"));
        if (typeof manifest.runId === "string" && manifest.runId !== options.runId) issues.push(makeIssue("RUN_ID_MISMATCH"));
      } catch {
        issues.push(makeIssue("INVALID_MANIFEST_JSON"));
      }
    }

    const snapshot = await readSnapshot(resolve(options.exportRoot));
    const objects = await inspectStorage(resolve(options.exportRoot), snapshot._storage ?? []);
    const plan = compileSnapshot(snapshot, objects);
    if (plan.issues.length > 0) {
      for (const planIssue of plan.issues) issues.push(makeIssue("PLAN_ISSUE", { table: planIssue.table, detail: planIssue.code, ...(planIssue.field !== undefined ? { field: planIssue.field } : {}) }));
    }
    assertSourceAccounting(snapshot, plan);
    planHash = createHash("sha256").update(canonical(plan)).digest("hex");
    expectedRows = plan.rows.length;
    expectedObjects = plan.objects.length;

    const byTarget = new Map<string, PlannedRow[]>();
    for (const row of plan.rows) {
      const rows = byTarget.get(row.table) ?? [];
      rows.push(row);
      byTarget.set(row.table, rows);
    }

    const { createDatabaseClient } = await import("@lobbystack/db");
    const database = createDatabaseClient("lobbystack_readonly", { DATABASE_URL: databaseUrl });
    const connection = await database.pool.connect();
    try {
      await connection.query("SET default_transaction_read_only = on");
      await connection.query("SET statement_timeout = '60s'");
      const identity = (await connection.query("SELECT current_database() AS database, current_user AS role")).rows[0] as { database?: unknown; role?: unknown } | undefined;
      databaseName = typeof identity?.database === "string" ? identity.database : null;
      role = typeof identity?.role === "string" ? identity.role : null;
      if (!databaseIdentityMatches(identity?.database, options.database)) issues.push(makeIssue("DATABASE_NAME_MISMATCH"));
      if (!isAllowedReadOnlyRole(identity?.role)) issues.push(makeIssue("ROLE_NOT_ALLOWED"));
      if (!issues.some((issue) => issue.code === "DATABASE_NAME_MISMATCH" || issue.code === "ROLE_NOT_ALLOWED")) {
        const context: ReconcileContext = {
          client: connection as unknown as PgClient,
          byTarget,
          issues,
          tables: perTable,
          checks,
          aggregates,
          sampledRows: 0,
        };
        await reconcileImportTables(context);
        await reconcileReferentialIntegrity(context);
        await reconcileTransformations(context);
        await reconcileAggregates(context);
        await reconcileDerivedPresence(context);
        await reconcileIndexes(context);
        await reconcileOperationalState(context, options.allowOutbox);
        objectsVerified = await verifyStorage(plan, options, context);
        sampledRows = context.sampledRows;
        for (const table of perTable) if (typeof table.actual === "number") actualRows += table.actual;
      }
    } finally {
      connection.release();
      await database.pool.end();
    }
    status = issues.length === 0 ? "passed" : issues.some((issue) => BLOCKING_CODES.has(issue.code)) ? "blocked" : "failed";
  } catch (error) {
    issues.push(makeIssue("RECONCILIATION_BLOCKED", { detail: safeErrorCode(error) }));
    status = "blocked";
  }

  const evidence: Record<string, unknown> = {
    runId: options.runId,
    mode: "target-reconciliation",
    releaseCertified: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    gitSha: gitSha(),
    manifestHash,
    planHash,
    databaseName,
    role,
    status,
    expectedRows,
    actualRows,
    expectedObjects,
    objectsVerified,
    sampledRows,
    perTable,
    aggregates,
    checks,
    transformationPolicy: REHEARSAL_TRANSFORMATIONS,
    issueCodes: issues.map(formatIssueCode),
    issues,
  };

  let wroteReport = false;
  try {
    await writePrivateReport(options.reportPath, evidence);
    wroteReport = true;
  } catch (error) {
    issues.push(makeIssue("REPORT_WRITE_FAILED", { detail: safeErrorCode(error) }));
    evidence.issueCodes = issues.map(formatIssueCode);
    evidence.issues = issues;
    evidence.status = "blocked";
    status = "blocked";
  }

  console.log(JSON.stringify({ status, issueCodes: evidence.issueCodes, expectedRows, actualRows, sampledRows, objectsVerified, releaseCertified: false }));
  process.exitCode = status === "passed" && wroteReport ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(safeErrorCode(error));
    process.exitCode = 1;
  });
}
