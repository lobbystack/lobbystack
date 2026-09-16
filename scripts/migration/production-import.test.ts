import { describe, expect, it } from "vitest";
import { REHEARSAL_TRANSFORMATIONS, type PlannedRow, type SnapshotPlan } from "./snapshot-plan.ts";
import {
  PRODUCTION_SOURCE_DEPLOYMENT,
  assertApplyApproval,
  assertHash,
  assertPlanConfirmed,
  assertProductionPolicy,
  assertProductionTarget,
  assertReviewedManifest,
  assertRunId,
  assertSourceDeployment,
  assertTargetIdentity,
  buildEvidence,
  buildPlanArtifact,
  digest,
  parseArgs,
  planDigest,
  prepareInsert,
  readbackMismatch,
  requiredArg,
  resolveImportMode,
  type ForeignKey,
} from "./import-engine.ts";

const sha = (character: string) => character.repeat(64);

const plan: SnapshotPlan = {
  version: 1,
  rows: [
    { sourceTable: "users", sourceId: "u1", table: "users", values: { id: "00000000-0000-4000-8000-000000000001", email: "row-secret-value" } },
  ],
  objects: [{ id: "f1", path: "_storage/f1", key: "tenant/f1", size: 3, sha256: sha("c"), contentType: "text/plain" }],
  issues: [],
  sourceCounts: { users: 1 },
  dispositions: {
    users: { action: "import", reason: "authoritative source" },
    authSessions: { action: "discard", reason: "ephemeral legacy state; never replay automatically" },
  },
};

const targetIdentity = {
  environment: "production",
  identity: "pg-primary-a",
  database: "lobbystack",
  nonce: sha("a"),
  manifestSha256: sha("b"),
};

describe("production import apply guards", () => {
  it("requires the explicit production approval and replacement maintenance mode for apply", () => {
    expect(() => assertApplyApproval({})).toThrow("PRODUCTION_IMPORT_NOT_APPROVED");
    expect(() => assertApplyApproval({ PRODUCTION_IMPORT_APPROVED: "false", LOBBYSTACK_MAINTENANCE_MODE: "true" })).toThrow("PRODUCTION_IMPORT_NOT_APPROVED");
    expect(() => assertApplyApproval({ PRODUCTION_IMPORT_APPROVED: "true", LOBBYSTACK_MAINTENANCE_MODE: "false" })).toThrow("MAINTENANCE_MODE_REQUIRED");
    expect(() => assertApplyApproval({ PRODUCTION_IMPORT_APPROVED: "true", LOBBYSTACK_MAINTENANCE_MODE: "true" })).not.toThrow();
  });

  it("refuses apply combined with plan-only or verify", () => {
    expect(() => resolveImportMode({ apply: true, verify: true, planOnly: false })).toThrow("INCOMPATIBLE_MODES");
    expect(() => resolveImportMode({ apply: true, verify: false, planOnly: true })).toThrow("INCOMPATIBLE_MODES");
    expect(() => resolveImportMode({ apply: false, verify: false, planOnly: false })).toThrow("MODE_REQUIRED");
    expect(resolveImportMode({ apply: true, verify: false, planOnly: false })).toBe("apply");
    expect(resolveImportMode({ apply: false, verify: true, planOnly: false })).toBe("verify");
    expect(resolveImportMode({ apply: false, verify: false, planOnly: true })).toBe("plan-only");
  });

  it("accepts only the allowlisted source deployment", () => {
    expect(() => assertSourceDeployment(PRODUCTION_SOURCE_DEPLOYMENT)).not.toThrow();
    expect(() => assertSourceDeployment("prod:other-deployment")).toThrow("SOURCE_NOT_ALLOWLISTED");
  });

  it("accepts only a remote PostgreSQL migration target", () => {
    expect(assertProductionTarget("postgres://lobbystack_migrator:fixture@db.example.test:5432/lobbystack")).toBe("lobbystack");
    expect(() => assertProductionTarget("postgres://postgres:fixture@localhost/lobbystack")).toThrow("LOCAL_TARGET_NOT_PRODUCTION");
    expect(() => assertProductionTarget("postgres://postgres:fixture@127.0.0.1/lobbystack")).toThrow("LOCAL_TARGET_NOT_PRODUCTION");
    expect(() => assertProductionTarget("postgres://lobbystack_app:fixture@db.example.test/lobbystack")).toThrow("MIGRATION_ROLE_REQUIRED");
    expect(() => assertProductionTarget("postgres://postgres:fixture@db.example.test/lobbystack?host=production")).toThrow("PRODUCTION_TARGET_INVALID");
  });

  it("rejects malformed and mismatched run and mode arguments", () => {
    expect(() => assertRunId("run-1_ok")).not.toThrow();
    expect(() => assertRunId("bad run")).toThrow("INVALID_RUN_ID");
    const args = parseArgs(["--run-id=run-1", "--apply"]);
    expect(requiredArg(args, "run-id")).toBe("run-1");
    expect(() => requiredArg(args, "report")).toThrow("MISSING_REPORT");
  });
});

describe("production import artifact and hash guards", () => {
  it("rejects archive, manifest, inventory, and policy hash mismatches", () => {
    expect(() => assertHash(sha("d"), sha("e"), "ARCHIVE_HASH_MISMATCH")).toThrow("ARCHIVE_HASH_MISMATCH");
    expect(() => assertHash(sha("d"), sha("d"), "MANIFEST_HASH_MISMATCH")).not.toThrow();
    expect(() => assertHash(sha("d"), "not-a-digest", "POLICY_HASH_MISMATCH")).toThrow("POLICY_HASH_MISMATCH");
  });

  it("aborts unless the confirmed plan hash equals the canonical plan digest", () => {
    const confirmed = planDigest(plan);
    expect(assertPlanConfirmed(plan, confirmed)).toBe(confirmed);
    expect(() => assertPlanConfirmed(plan, sha("0"))).toThrow("PLAN_HASH_NOT_CONFIRMED");
    expect(() => assertPlanConfirmed(plan, "short")).toThrow("PLAN_HASH_NOT_CONFIRMED");
  });

  it("serializes a plan artifact without any row values", () => {
    const artifact = buildPlanArtifact(plan, "run-2026");
    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toContain("row-secret-value");
    expect(serialized).not.toContain("00000000-0000-4000-8000-000000000001");
    expect(serialized).not.toContain("_storage/f1");
    expect(artifact.planHash).toBe(planDigest(plan));
    expect(artifact.runId).toBe("run-2026");
    expect(artifact.sourceCounts).toEqual({ users: 1 });
    expect(artifact.targetCounts).toEqual({ users: 1 });
    expect(artifact.objects).toEqual([{ id: "f1", key: "tenant/f1", size: 3, sha256: sha("c") }]);
  });

  it("builds evidence with hashed identity and unassigned ownership", () => {
    const evidence = buildEvidence({
      runId: "run-2026",
      mode: "plan-only",
      gitSha: "0".repeat(40),
      sourceDeployment: PRODUCTION_SOURCE_DEPLOYMENT,
      targetEnvironment: "production",
      targetIdentity: targetIdentity.identity,
      archiveHash: sha("d"),
      manifestHash: sha("b"),
      policyHash: sha("e"),
      planHash: planDigest(plan),
      startedAt: "2026-09-13T00:00:00.000Z",
      sourceCounts: plan.sourceCounts,
      rowsVerified: 0,
      objectsVerified: 0,
      idempotentReplay: false,
      status: "planned",
    });
    expect(evidence.releaseCertified).toBe(false);
    expect(evidence.owner).toBe("UNASSIGNED");
    expect(evidence.reviewer).toBe("UNASSIGNED");
    expect(evidence.targetIdentityHash).toBe(digest(targetIdentity.identity));
    expect(evidence.targetIdentityHash).not.toBe(targetIdentity.identity);
    expect(JSON.stringify(evidence)).not.toContain(targetIdentity.identity);
  });
});

describe("production import identity and manifest guards", () => {
  it("accepts a fully valid synthetic identity and reviewed manifest", () => {
    expect(() => assertTargetIdentity(targetIdentity, { ...targetIdentity })).not.toThrow();
    expect(() => assertReviewedManifest(
      { version: 1, source: { deployment: PRODUCTION_SOURCE_DEPLOYMENT }, target: { environment: "production", identity: "pg-primary-a" } },
      { sourceDeployment: PRODUCTION_SOURCE_DEPLOYMENT, targetEnvironment: "production", targetIdentity: "pg-primary-a" },
    )).not.toThrow();
  });

  it("rejects target identity environment, identity, database, nonce, and manifest digest mismatches", () => {
    expect(() => assertTargetIdentity(targetIdentity, { ...targetIdentity, environment: "staging" })).toThrow("TARGET_ENVIRONMENT_MISMATCH");
    expect(() => assertTargetIdentity(targetIdentity, { ...targetIdentity, identity: "pg-primary-b" })).toThrow("TARGET_IDENTITY_MISMATCH");
    expect(() => assertTargetIdentity(targetIdentity, { ...targetIdentity, database: "other" })).toThrow("TARGET_DATABASE_MISMATCH");
    expect(() => assertTargetIdentity(targetIdentity, { ...targetIdentity, nonce: sha("f") })).toThrow("TARGET_NONCE_MISMATCH");
    expect(() => assertTargetIdentity(targetIdentity, { ...targetIdentity, manifestSha256: sha("f") })).toThrow("TARGET_MANIFEST_MISMATCH");
  });

  it("rejects malformed and mismatched reviewed manifests", () => {
    const expected = { sourceDeployment: PRODUCTION_SOURCE_DEPLOYMENT, targetEnvironment: "production", targetIdentity: "pg-primary-a" };
    expect(() => assertReviewedManifest(null, expected)).toThrow("MANIFEST_INVALID");
    expect(() => assertReviewedManifest({ version: 2, source: { deployment: PRODUCTION_SOURCE_DEPLOYMENT }, target: { environment: "production", identity: "pg-primary-a" } }, expected)).toThrow("MANIFEST_INVALID");
    expect(() => assertReviewedManifest({ version: 1, source: { deployment: "prod:other" }, target: { environment: "production", identity: "pg-primary-a" } }, expected)).toThrow("MANIFEST_SOURCE_MISMATCH");
    expect(() => assertReviewedManifest({ version: 1, source: { deployment: PRODUCTION_SOURCE_DEPLOYMENT }, target: { environment: "production", identity: "other" } }, expected)).toThrow("MANIFEST_TARGET_MISMATCH");
    expect(() => assertTargetIdentity({}, { ...targetIdentity })).toThrow("TARGET_IDENTITY_FILE_INVALID");
    expect(() => assertTargetIdentity({ ...targetIdentity, nonce: "short" }, { ...targetIdentity })).toThrow("TARGET_IDENTITY_FILE_INVALID");
  });
});

describe("production import policy and row helpers", () => {
  it("accepts a reviewed production policy and rejects scope, version, disposition, and transformation drift", () => {
    const policy = { scope: "production-import", version: 1, dispositions: plan.dispositions, transformations: REHEARSAL_TRANSFORMATIONS };
    expect(() => assertProductionPolicy(policy, plan)).not.toThrow();
    expect(() => assertProductionPolicy({ ...policy, scope: "isolated-rehearsal-only" }, plan)).toThrow("POLICY_SCOPE_MISMATCH");
    expect(() => assertProductionPolicy({ ...policy, version: 2 }, plan)).toThrow("POLICY_VERSION_MISMATCH");
    expect(() => assertProductionPolicy({ ...policy, dispositions: {} }, plan)).toThrow("POLICY_DISPOSITION_MISMATCH");
    expect(() => assertProductionPolicy({ ...policy, transformations: {} }, plan)).toThrow("POLICY_TRANSFORMATION_MISMATCH");
  });

  it("defers optional foreign keys and blocks on unresolved required ones", () => {
    const row: PlannedRow = { sourceTable: "calls", sourceId: "c1", table: "calls", values: { id: "call-uuid", contact_id: "contact-uuid" } };
    const optional: ForeignKey = { table_name: "calls", column_name: "contact_id", parent_table: "contacts", required: false };
    const deferred = prepareInsert(row, [optional], () => false);
    expect(deferred.blocked).toBe(false);
    expect(deferred.values.contact_id).toBeNull();
    expect(deferred.deferred).toEqual([{ column: "contact_id", value: "contact-uuid" }]);
    expect(prepareInsert(row, [{ ...optional, required: true }], () => false).blocked).toBe(true);
    const satisfied = prepareInsert(row, [optional], (key) => key === "contacts:contact-uuid");
    expect(satisfied.blocked).toBe(false);
    expect(satisfied.values.contact_id).toBe("contact-uuid");
    expect(satisfied.deferred).toEqual([]);
  });

  it("compares readback values canonically", () => {
    const row: PlannedRow = { sourceTable: "users", sourceId: "u1", table: "users", values: { id: "user-uuid", email: "row-secret-value" } };
    expect(readbackMismatch(row, { id: "user-uuid", email: "row-secret-value" })).toBeUndefined();
    expect(readbackMismatch(row, { id: "user-uuid", email: "different-value" })).toBe("email");
  });
});
