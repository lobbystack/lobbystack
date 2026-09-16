import { describe, expect, it } from "vitest";
import { assertSourceAccounting, compileSnapshot, legacyUuid, type Snapshot, type SourceRow } from "./snapshot-plan.ts";
import { assertRehearsalTarget, canonical } from "./rehearsal-import.ts";

const row = (id: string, values: Record<string, unknown>): SourceRow => ({ _id: id, _creationTime: 1_700_000_000_000, ...values });
function fixture(): Snapshot {
  return {
    _storage: [], authAccounts: [],
    users: [row("u1", { email: "Owner@Example.invalid" })],
    businesses: [row("b1", { slug: "example", name: "Example", timezone: "UTC", businessType: "service_company" })],
    business_memberships: [row("m1", { userId: "u1", businessId: "b1", role: "business_owner" })],
  };
}

describe("snapshot compilation", () => {
  it("is deterministic, preserves content, normalizes identities, and resolves IDs", () => {
    const snapshot = fixture();
    snapshot.knowledge_snippets = [row("s1", { businessId: "b1", title: "Title", content: "  exact source content\n", active: false })];
    const plan = compileSnapshot(snapshot);
    expect(plan.issues).toEqual([]);
    expect(canonical(compileSnapshot(snapshot))).toBe(canonical(plan));
    expect(plan.rows.find((r) => r.table === "users")?.values.normalized_email).toBe("owner@example.invalid");
    expect(plan.rows.find((r) => r.table === "business_memberships")?.values.business_id).toBe(legacyUuid("b1"));
    expect(plan.rows.find((r) => r.table === "knowledge_snippets")?.values).toMatchObject({ active: false, content: "  exact source content\n" });
  });

  it("blocks missing references, unknown fields and unclassified populated tables", () => {
    const snapshot = fixture();
    snapshot.business_memberships![0]!.businessId = "missing";
    snapshot.businesses![0]!.unsupported = "private-value";
    snapshot.new_table = [row("other", {})];
    const plan = compileSnapshot(snapshot);
    expect(plan.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["UNRESOLVED_REFERENCE", "UNMAPPED_SOURCE_FIELD", "UNCLASSIFIED_SOURCE_TABLE"]));
    expect(JSON.stringify(plan.issues)).not.toContain("private-value");
  });

  it("does not invent customer identifiers or timestamps", () => {
    const snapshot = fixture();
    snapshot.users![0]!.email = undefined;
    snapshot.businesses![0]!._creationTime = NaN;
    expect(compileSnapshot(snapshot).issues.map((i) => i.code)).toEqual(expect.arrayContaining(["MISSING_EMAIL", "INVALID_TIMESTAMP"]));
  });

  it("retains legacy-only fields explicitly and isolates calendar credentials", () => {
    const snapshot = fixture();
    snapshot.users![0]!.signupAttribution = "test";
    snapshot.calendar_connections = [row("cal1", { businessId: "b1", ownerUserId: "u1", provider: "google", externalAccountId: "account", encryptedAccessToken: "fixture-encrypted", encryptedRefreshToken: "fixture-refresh", status: "connected" })];
    const plan = compileSnapshot(snapshot);
    expect(plan.issues).toEqual([]);
    const calendar = plan.rows.find((r) => r.table === "calendar_connections")!;
    expect(calendar.values).toMatchObject({ status: "disconnected", encrypted_access_token: null, encrypted_refresh_token: null });
    expect(calendar.legacyMetadata?.encryptedAccessTokenSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(calendar)).not.toContain("fixture-encrypted");
  });

  it("accounts for orphan objects without inventing tenant ownership", () => {
    const snapshot = fixture();
    snapshot._storage = [row("file1", { size: 1, contentType: "text/plain" })];
    const plan = compileSnapshot(snapshot, [{ id: "file1", path: "_storage/file1.txt", size: 1, sha256: "a".repeat(64) }]);
    expect(plan.issues).toEqual([]);
    expect(plan.objects[0]?.key).toBe("migration-archive/file1");
    expect(plan.rows.some((r) => r.table === "storage_objects")).toBe(false);
  });

  it("rejects cross-tenant storage reuse and retains disabled documents", () => {
    const snapshot = fixture();
    snapshot.businesses!.push(row("b2", { slug: "other", name: "Other", timezone: "UTC", businessType: "service_company" }));
    snapshot.knowledge_documents = [row("d1", { businessId: "b1", storageId: "file1", sourceType: "upload", title: "A", active: false }), row("d2", { businessId: "b2", storageId: "file1", sourceType: "upload", title: "B" })];
    snapshot._storage = [row("file1", { size: 1 })];
    const plan = compileSnapshot(snapshot, [{ id: "file1", path: "_storage/file1.txt", size: 1, sha256: "a".repeat(64) }]);
    expect(plan.issues.map((i) => i.code)).toContain("CROSS_TENANT_STORAGE_REFERENCE");
    expect(plan.rows.find((r) => r.sourceId === "d1")?.values.active).toBe(false);
  });

  it("maps resolved inbox state and never restores expired message content", () => {
    const snapshot = fixture();
    snapshot.inbox_items = [row("i1", { businessId: "b1", kind: "calendar_sync", status: "resolved", contentRetentionStatus: "expired", title: "private", body: "private" })];
    const inbox = compileSnapshot(snapshot).rows.find((r) => r.table === "inbox_items")!;
    expect(inbox.values).toMatchObject({ status: "done", content_retention_status: "scrubbed" });
    expect(JSON.stringify(inbox)).not.toContain("private");
  });
});

describe("rehearsal target isolation", () => {
  it("blocks partial snapshots and detects missing or duplicate source mappings", () => {
    expect(compileSnapshot({ _storage: [] }).issues.map((issue) => issue.code)).toContain("REQUIRED_SOURCE_TABLE_MISSING");
    const source = fixture();
    const plan = compileSnapshot(source);
    expect(() => assertSourceAccounting(source, plan)).not.toThrow();
    plan.rows = plan.rows.filter((row) => row.table !== "users");
    expect(() => assertSourceAccounting(source, plan)).toThrow("SOURCE_ROW_ACCOUNTING_MISMATCH:users");
  });
  it("accepts only the exact disposable localhost target and migration role", () => {
    expect(() => assertRehearsalTarget("postgres://postgres:fixture@127.0.0.1:15439/migration_rehearsal_one", "migration_rehearsal_one")).not.toThrow();
    for (const value of ["postgres://postgres:fixture@db.example/migration_rehearsal_one", "postgres://postgres:fixture@localhost/production", "postgres://lobbystack_app:fixture@localhost/migration_rehearsal_one", "postgres://postgres:fixture@localhost/migration_rehearsal_one?host=production"]) {
      expect(() => assertRehearsalTarget(value, "migration_rehearsal_one")).toThrow();
    }
  });
});
