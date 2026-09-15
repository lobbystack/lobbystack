import { execFileSync } from "node:child_process";
import { open, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { assertSourceAccounting, compileSnapshot } from "./snapshot-plan.ts";
import { readSnapshot } from "./snapshot-plan-check.ts";
import { fileDigest, inspectStorage, verifyLocalObjects } from "./snapshot-storage.ts";
import { writePrivateArtifact } from "./production-snapshot-audit.ts";
import {
  TARGET_TABLES,
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
  insertPlannedRows,
  parseArgs,
  planDigest,
  quoteIdentifier,
  requiredArg,
  resolveImportMode,
  verifyInventory,
  verifyPlannedRows,
  type ForeignKey,
} from "./import-engine.ts";

function errorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z_]+(?::[a-zA-Z0-9_,]+)*$/.test(error.message) ? error.message : "IMPORT_FAILED_REDACTED";
}

function gitSha(): string {
  const fromEnv = process.env.GIT_SHA ?? process.env.GITHUB_SHA;
  if (fromEnv && /^[a-f0-9]{7,40}$/i.test(fromEnv)) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "UNKNOWN";
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveImportMode({ apply: args.has("--apply"), verify: args.has("--verify"), planOnly: args.has("--plan-only") });

  const runId = requiredArg(args, "run-id");
  assertRunId(runId);
  const sourceDeployment = requiredArg(args, "source-deployment");
  assertSourceDeployment(sourceDeployment);
  const targetEnvironment = requiredArg(args, "target-environment");
  const targetEnvironmentIdentity = requiredArg(args, "target-environment-identity");
  if (mode === "apply") assertApplyApproval(process.env);

  const targetUrl = process.env.PRODUCTION_IMPORT_DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_IMPORT_DATABASE_URL_REQUIRED");
  const databaseName = assertProductionTarget(targetUrl);
  const nonce = process.env.PRODUCTION_IMPORT_TARGET_NONCE;
  if (!nonce || !/^[a-f0-9]{64}$/.test(nonce)) throw new Error("PRODUCTION_IMPORT_TARGET_NONCE_REQUIRED");

  const archiveHash = requiredArg(args, "archive-sha256");
  assertHash(await fileDigest(requiredArg(args, "archive")), archiveHash, "ARCHIVE_HASH_MISMATCH");

  const manifestPath = requiredArg(args, "manifest");
  const manifestHash = requiredArg(args, "manifest-sha256");
  assertHash(await fileDigest(manifestPath), manifestHash, "MANIFEST_HASH_MISMATCH");
  assertReviewedManifest(JSON.parse(await readFile(manifestPath, "utf8")), { sourceDeployment, targetEnvironment, targetIdentity: targetEnvironmentIdentity });

  const policyHash = requiredArg(args, "policy-sha256");
  const policy = JSON.parse(await readFile(requiredArg(args, "policy"), "utf8"));
  assertHash(await fileDigest(requiredArg(args, "policy")), policyHash, "POLICY_HASH_MISMATCH");

  assertTargetIdentity(JSON.parse(await readFile(requiredArg(args, "target-identity-file"), "utf8")), {
    environment: targetEnvironment,
    identity: targetEnvironmentIdentity,
    database: databaseName,
    nonce,
    manifestSha256: manifestHash,
  });

  const exportRoot = await realpath(requiredArg(args, "export"));
  const objectsArg = args.get("--objects");
  const objectsRoot = objectsArg ? await realpath(objectsArg) : undefined;
  if (objectsRoot && (objectsRoot === exportRoot || objectsRoot.startsWith(`${exportRoot}${sep}`) || exportRoot.startsWith(`${objectsRoot}${sep}`))) throw new Error("OBJECT_TARGET_OVERLAPS_SOURCE");

  await verifyInventory(exportRoot, requiredArg(args, "inventory"), requiredArg(args, "inventory-sha256"));

  const snapshot = await readSnapshot(exportRoot);
  const objects = await inspectStorage(exportRoot, snapshot._storage ?? []);
  const plan = compileSnapshot(snapshot, objects);
  if (plan.issues.length) {
    console.error(JSON.stringify({ status: "blocked", issues: plan.issues }));
    process.exitCode = 1;
    return;
  }
  assertSourceAccounting(snapshot, plan);
  assertProductionPolicy(policy, plan);
  const planHash = planDigest(plan);

  const confirmed = args.get("--confirm-plan-hash");
  if (mode === "plan-only") {
    if (confirmed) assertPlanConfirmed(plan, confirmed);
  } else {
    assertPlanConfirmed(plan, requiredArg(args, "confirm-plan-hash"));
  }

  const reportParent = await realpath(dirname(resolve(requiredArg(args, "report"))));
  const reportFile = join(reportParent, basename(requiredArg(args, "report")));
  if (reportParent === exportRoot || reportParent.startsWith(`${exportRoot}${sep}`) || (objectsRoot && (reportParent === objectsRoot || reportParent.startsWith(`${objectsRoot}${sep}`)))) throw new Error("REPORT_OVERLAPS_DATA");

  const evidence = buildEvidence({
    runId,
    mode,
    gitSha: gitSha(),
    sourceDeployment,
    targetEnvironment,
    targetIdentity: targetEnvironmentIdentity,
    archiveHash,
    manifestHash,
    policyHash,
    planHash,
    startedAt: new Date().toISOString(),
    sourceCounts: plan.sourceCounts,
    rowsVerified: 0,
    objectsVerified: 0,
    idempotentReplay: false,
    status: mode === "plan-only" ? "planned" : "failed",
  });
  const report = await open(reportFile, "wx", 0o600);
  const persist = async () => {
    const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
    await report.truncate(0);
    await report.write(bytes, 0, bytes.length, 0);
    await report.sync();
  };

  try {
    if (mode === "plan-only") {
      await writePrivateArtifact(`${reportFile}.plan.json`, buildPlanArtifact(plan, runId));
      evidence.status = "planned";
      evidence.finishedAt = new Date().toISOString();
      console.log(JSON.stringify({ status: "planned", planHash, rows: plan.rows.length, objects: plan.objects.length, releaseCertified: false }));
      return;
    }

    if (objectsRoot) {
      await verifyLocalObjects(objectsRoot, plan.objects);
      evidence.objectsVerified = plan.objects.length;
    } else {
      evidence.limitation = "REMOTE_OBJECT_TRANSFER_NOT_IMPLEMENTED; objectsVerified=0";
    }

    const { createDatabaseClient } = await import("@lobbystack/db");
    const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: targetUrl });
    const client = await database.pool.connect();
    const query = (text: string, values?: unknown[]) => client.query(text, values);
    let transaction = false;
    try {
      await client.query("BEGIN");
      transaction = true;
      await client.query("SELECT pg_advisory_xact_lock(704193813)");
      const connected = await client.query("SELECT current_database() AS database, current_user AS role");
      if (connected.rows[0]?.database !== databaseName || !["postgres", "lobbystack_migrator"].includes(connected.rows[0]?.role)) throw new Error("CONNECTED_TARGET_MISMATCH");
      const marker = await client.query("SELECT database_name, nonce FROM migration_control.target");
      if (marker.rows.length !== 1 || marker.rows[0]?.database_name !== databaseName || marker.rows[0]?.nonce !== nonce) throw new Error("DATABASE_TARGET_MARKER_MISMATCH");
      await client.query("SET LOCAL statement_timeout = '30s'");
      const journals = await client.query("SELECT to_regclass('migration_control.runs') AS runs, to_regclass('migration_control.lineage') AS lineage");
      if (!journals.rows[0]?.runs || !journals.rows[0]?.lineage) throw new Error("JOURNAL_REQUIRED");
      const previous = await client.query("SELECT plan_hash FROM migration_control.runs WHERE archive_hash=$1", [archiveHash]);
      const rerun = previous.rows.length > 0;
      if (rerun && previous.rows[0]?.plan_hash !== planHash) throw new Error("PREVIOUS_IMPORT_PLAN_DIFFERS");
      if (mode === "verify" && !rerun) throw new Error("TARGET_NOT_IMPORTED");
      if (mode === "apply" && !rerun) {
        for (const name of Object.keys(TARGET_TABLES)) {
          const count = await client.query(`SELECT count(*)::int AS count FROM public.${quoteIdentifier(name)}`);
          if (count.rows[0]?.count !== 0) throw new Error(`TARGET_NOT_EMPTY:${name}`);
        }
        const foreignKeys = await client.query(`
          SELECT child.relname AS table_name, a.attname AS column_name, parent.relname AS parent_table, a.attnotnull AS required
          FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
          JOIN pg_namespace n ON n.oid=child.relnamespace JOIN pg_class parent ON parent.oid=c.confrelid
          JOIN pg_attribute a ON a.attrelid=child.oid AND a.attnum=c.conkey[1]
          WHERE c.contype='f' AND n.nspname='public' AND cardinality(c.conkey)=1
        `);
        await insertPlannedRows({ query }, plan.rows, foreignKeys.rows as ForeignKey[]);
      }
      const counts = await verifyPlannedRows({ query }, plan.rows, rerun);
      for (const [name, expected] of Object.entries(counts)) {
        const result = await client.query(`SELECT count(*)::int AS count FROM public.${quoteIdentifier(name)}`);
        if (result.rows[0]?.count !== expected) throw new Error(`TARGET_COUNT_MISMATCH:${name}`);
      }
      evidence.targetCounts = counts;
      evidence.rowsVerified = plan.rows.length;
      evidence.idempotentReplay = rerun;
      evidence.status = mode === "apply" ? "committed" : "verified";
      evidence.finishedAt = new Date().toISOString();
      if (mode === "apply" && !rerun) await client.query("INSERT INTO migration_control.runs VALUES ($1,$2,$3)", [archiveHash, planHash, JSON.stringify(evidence)]);
      await client.query(mode === "apply" ? "COMMIT" : "ROLLBACK");
      transaction = false;
      console.log(JSON.stringify({ status: evidence.status, rowsVerified: plan.rows.length, objectsVerified: evidence.objectsVerified, idempotentReplay: rerun, releaseCertified: false }));
    } catch (error) {
      evidence.status = "failed";
      evidence.error = errorCode(error);
      process.exitCode = 1;
      console.error(JSON.stringify({ status: "failed", error: evidence.error }));
    } finally {
      if (transaction) await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await database.pool.end();
    }
  } catch (error) {
    evidence.status = "failed";
    evidence.error = errorCode(error);
    process.exitCode = 1;
    console.error(JSON.stringify({ status: "failed", error: evidence.error }));
  } finally {
    evidence.finishedAt ??= new Date().toISOString();
    await persist().catch(() => undefined);
    await report.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch((error) => {
  console.error(errorCode(error));
  process.exitCode = 1;
});
