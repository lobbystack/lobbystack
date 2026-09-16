import { describe, expect, it } from "vitest";
import {
  comparableValues,
  compareAggregates,
  compareTableRows,
  databaseIdentityMatches,
  evaluateForeignKeys,
  evaluatePresence,
  evaluateTransforms,
  formatIssueCode,
  isAllowedReadOnlyRole,
  isValidRunId,
  isValidSha256,
  normalizeTargetValue,
  reconcileTargetTables,
  selectSampleKeys,
  type ComparableRow,
} from "./target-reconciliation.ts";

const row = (key: string, values: Record<string, unknown> | null): ComparableRow => ({ key, values });

describe("table row comparison", () => {
  it("flags a row count mismatch and missing legacy ids", () => {
    const result = compareTableRows({
      table: "contacts",
      expected: [row("a", { id: "a" }), row("b", { id: "b" })],
      actual: [row("a", { id: "a" })],
      fields: ["id"],
    });
    expect(result.issues.map((issue) => issue.code)).toContain("ROW_COUNT_MISMATCH");
    expect(result.issues.find((issue) => issue.code === "MISSING_LEGACY_ID")?.count).toBe(1);
    expect(result.missingCount).toBe(1);
  });

  it("flags unexpected extra legacy ids", () => {
    const result = compareTableRows({
      table: "contacts",
      expected: [row("a", { id: "a" })],
      actual: [row("a", { id: "a" }), row("b", { id: "b" })],
      fields: ["id"],
    });
    expect(result.issues.map((issue) => issue.code)).toContain("ROW_COUNT_MISMATCH");
    expect(result.issues.find((issue) => issue.code === "EXTRA_LEGACY_ID")?.count).toBe(1);
    expect(result.extraCount).toBe(1);
  });

  it("flags duplicate legacy ids on the target", () => {
    const result = compareTableRows({
      table: "billing_transactions",
      expected: [row("a", { id: "a" })],
      actual: [row("a", { id: "a" }), row("a", { id: "a" })],
      fields: ["id"],
    });
    expect(result.issues.find((issue) => issue.code === "DUPLICATE_LEGACY_ID")?.count).toBe(1);
    expect(result.duplicateActualCount).toBe(1);
  });

  it("counts field mismatches per column and honours PostgreSQL coercion", () => {
    const result = compareTableRows({
      table: "calls",
      expected: [row("a", { id: "a", status: "started", transport: "pstn", transport_ms: 0, occurred_at: "2023-11-14T22:13:20.000Z", meta: { a: 1, b: 2 } })],
      actual: [row("a", { id: "a", status: "ended", transport: "pstn", transport_ms: 0, occurred_at: new Date("2023-11-14T22:13:20.000Z"), meta: { b: 2, a: 1 } })],
      fields: ["id", "status", "transport", "transport_ms", "occurred_at", "meta"],
    });
    expect(result.issues.filter((issue) => issue.code === "FIELD_MISMATCH").map((issue) => issue.field)).toEqual(["status"]);
    expect(result.fieldMismatch.status).toBe(1);
    expect(result.fieldMismatch.transport).toBeUndefined();
    expect(result.fieldMismatch.occurred_at).toBeUndefined();
  });

  it("does not compare fields when only key existence was read", () => {
    const result = compareTableRows({
      table: "messages",
      expected: [row("a", { id: "a", body: "x" })],
      actual: [row("a", null)],
      fields: ["body"],
    });
    expect(result.issues).toEqual([]);
    expect(result.comparedRows).toBe(0);
  });
});

describe("aggregate comparison", () => {
  it("flags per-field aggregate mismatches without exposing group keys", () => {
    const result = compareAggregates(
      "billing_transactions",
      [{ key: "subscription\u0000paid\u0000usd", values: { amount_cents: 100 } }],
      [{ key: "subscription\u0000paid\u0000usd", values: { amount_cents: 120 } }],
      ["amount_cents"],
    );
    const mismatch = result.issues.find((issue) => issue.code === "AGGREGATE_MISMATCH");
    expect(mismatch?.field).toBe("amount_cents");
    expect(mismatch?.count).toBe(1);
    expect(JSON.stringify(result.issues)).not.toContain("subscription");
  });

  it("flags missing and extra groups", () => {
    const result = compareAggregates(
      "billing_usage_events",
      [{ key: "voice_seconds", values: { quantity: 10 } }],
      [{ key: "alert_sms_segments", values: { quantity: 10 } }],
      ["quantity"],
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["AGGREGATE_GROUP_MISSING", "AGGREGATE_GROUP_EXTRA"]));
  });
});

describe("integrity, transforms, presence", () => {
  it("flags referential orphan counts", () => {
    const issues = evaluateForeignKeys([{ childTable: "calls", childColumn: "business_id", parentTable: "businesses", parentColumn: "id", orphanCount: 3 }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "ORPHAN_FOREIGN_KEY", table: "calls", field: "business_id", count: 3 });
    expect(evaluateForeignKeys([{ childTable: "calls", childColumn: "business_id", parentTable: "businesses", parentColumn: "id", orphanCount: 0 }])).toEqual([]);
  });

  it("flags rehearsal transformation violations", () => {
    const issues = evaluateTransforms([{ name: "calendar_disconnected", violations: 2 }, { name: "sessions_discarded", violations: 0 }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "TRANSFORM_VIOLATION", detail: "calendar_disconnected", count: 2 });
  });

  it("flags derived presence mismatches and missing rollups", () => {
    expect(evaluatePresence([{ name: "business_context_snapshots", actual: 1, expected: 2 }])[0]).toMatchObject({ code: "DERIVED_COUNT_MISMATCH" });
    expect(evaluatePresence([{ name: "unit_economics_rollups", actual: 0, expectPositive: true }])[0]).toMatchObject({ code: "DERIVED_DATA_MISSING" });
    expect(evaluatePresence([{ name: "calendar_busy_blocks", actual: 0 }])).toEqual([]);
  });
});

describe("validation helpers", () => {
  it("accepts only the run-id allow-list", () => {
    expect(isValidRunId("recon_run-1")).toBe(true);
    expect(isValidRunId("A_-z9")).toBe(true);
    expect(isValidRunId("")).toBe(false);
    expect(isValidRunId("has space")).toBe(false);
    expect(isValidRunId("a".repeat(81))).toBe(false);
    expect(isValidRunId(undefined)).toBe(false);
  });

  it("accepts only 64-hex manifest digests", () => {
    expect(isValidSha256("a".repeat(64))).toBe(true);
    expect(isValidSha256("A".repeat(64))).toBe(true);
    expect(isValidSha256("a".repeat(63))).toBe(false);
    expect(isValidSha256("g".repeat(64))).toBe(false);
    expect(isValidSha256(1234)).toBe(false);
  });

  it("accepts only read-only reconciliation roles and a matching database", () => {
    expect(isAllowedReadOnlyRole("lobbystack_readonly")).toBe(true);
    expect(isAllowedReadOnlyRole("lobbystack_migrator")).toBe(true);
    expect(isAllowedReadOnlyRole("postgres")).toBe(true);
    expect(isAllowedReadOnlyRole("lobbystack_app")).toBe(false);
    expect(isAllowedReadOnlyRole(undefined)).toBe(false);
    expect(databaseIdentityMatches("reconciliation_target", "reconciliation_target")).toBe(true);
    expect(databaseIdentityMatches("other", "reconciliation_target")).toBe(false);
    expect(databaseIdentityMatches(undefined, "reconciliation_target")).toBe(false);
  });

  it("normalizes timestamps and samples deterministically", () => {
    const timestamp = "2023-11-14T22:13:20.000Z";
    expect(normalizeTargetValue(new Date(timestamp))).toBe(timestamp);
    expect(comparableValues(timestamp, new Date(timestamp))).toBe(true);
    expect(comparableValues({ a: 1, b: [true, null] }, { b: [true, null], a: 1 })).toBe(true);
    const keys = Array.from({ length: 10 }, (_, index) => `k${index}`);
    expect(selectSampleKeys(keys, 3)).toEqual(selectSampleKeys([...keys].reverse(), 3));
    expect(selectSampleKeys(keys, 100)).toEqual([...keys].sort());
  });

  it("formats issue codes with table/column identifiers only", () => {
    expect(formatIssueCode({ code: "FIELD_MISMATCH", table: "calls", field: "status", count: 1 })).toBe("FIELD_MISMATCH:calls:status");
    expect(formatIssueCode({ code: "MANIFEST_DIGEST_MISMATCH" })).toBe("MANIFEST_DIGEST_MISMATCH");
    expect(formatIssueCode({ code: "TRANSFORM_VIOLATION", detail: "calendar_disconnected" })).toBe("TRANSFORM_VIOLATION:calendar_disconnected");
  });
});

describe("reconcile target table selection", () => {
  it("maps source names and includes plan-generated tables", () => {
    const tables = reconcileTargetTables(
      ["users", "authAccounts", "_storage", "knowledge_documents"],
      { authAccounts: "accounts", _storage: "storage_objects" },
      ["accounts", "storage_objects", "knowledge_documents", "knowledge_chunks"],
    );
    expect(tables).toContain("users");
    expect(tables).toContain("accounts");
    expect(tables).toContain("storage_objects");
    // The plan generates knowledge_chunks even though no source table maps to it.
    expect(tables).toContain("knowledge_chunks");
    // No duplicates when a mapped target is also produced by the plan.
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("preserves source order and appends plan-only tables", () => {
    expect(reconcileTargetTables(["b", "a"], {}, ["c"])).toEqual(["b", "a", "c"]);
  });
});
