import { open, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { S3StorageProvider } from "@lobbystack/providers";

import { assertHash, parseArgs, planDigest, requiredArg, verifyInventory } from "./import-engine.ts";
import { assertSourceAccounting, compileSnapshot } from "./snapshot-plan.ts";
import { readSnapshot } from "./snapshot-plan-check.ts";
import { fileDigest, inspectStorage } from "./snapshot-storage.ts";
import { transferRemoteObjects, type MigrationObjectStore } from "./snapshot-s3.ts";

const SOURCE_DEPLOYMENT = "prod:determined-reindeer-80";

/**
 * Uploads (or verifies) the snapshot storage objects in the production bucket.
 * The production importer records remote object transfer as out of scope, so
 * object transfer is a separate, explicitly approved step that must run before
 * the database import.
 *
 * Required environment: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY, PRODUCTION_IMPORT_APPROVED=true.
 * Optional: S3_ENDPOINT, S3_FORCE_PATH_STYLE.
 */
async function main(): Promise<void> {
  if (process.env.PRODUCTION_IMPORT_APPROVED !== "true") throw new Error("PRODUCTION_IMPORT_NOT_APPROVED");
  const args = parseArgs(process.argv.slice(2));
  const verifyOnly = args.has("--verify-only");

  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("S3_CREDENTIALS_REQUIRED");

  const sourceDeployment = requiredArg(args, "source-deployment");
  if (sourceDeployment !== SOURCE_DEPLOYMENT) throw new Error("SOURCE_NOT_ALLOWLISTED");
  requiredArg(args, "target-environment");
  requiredArg(args, "target-environment-identity");
  const archiveHash = requiredArg(args, "archive-sha256");
  assertHash(await fileDigest(requiredArg(args, "archive")), archiveHash, "ARCHIVE_HASH_MISMATCH");
  const manifestPath = requiredArg(args, "manifest");
  const manifestHash = requiredArg(args, "manifest-sha256");
  assertHash(await fileDigest(manifestPath), manifestHash, "MANIFEST_HASH_MISMATCH");
  await verifyInventory(await realpath(requiredArg(args, "export")), requiredArg(args, "inventory"), requiredArg(args, "inventory-sha256"));

  const exportRoot = await realpath(requiredArg(args, "export"));
  const reportParent = await realpath(dirname(resolve(requiredArg(args, "report"))));
  if (reportParent === exportRoot || reportParent.startsWith(`${exportRoot}${sep}`)) throw new Error("REPORT_OVERLAPS_DATA");

  const snapshot = await readSnapshot(exportRoot);
  const objects = await inspectStorage(exportRoot, snapshot._storage ?? []);
  const plan = compileSnapshot(snapshot, objects);
  if (plan.issues.length) {
    console.error(JSON.stringify({ status: "blocked", issues: plan.issues }));
    process.exitCode = 1;
    return;
  }
  assertSourceAccounting(snapshot, plan);

  const store = new S3StorageProvider({
    bucket,
    region,
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  }) as unknown as MigrationObjectStore;

  const report = await open(join(reportParent, basename(requiredArg(args, "report"))), "wx", 0o600);
  const evidence: Record<string, unknown> = {
    runId: requiredArg(args, "run-id"),
    action: verifyOnly ? "verify" : "transfer",
    sourceDeployment,
    archiveHash,
    manifestHash,
    planHash: planDigest(plan),
    objects: plan.objects.length,
    verified: 0,
    status: "started",
    releaseCertified: false,
    startedAt: new Date().toISOString(),
  };
  const persist = async () => {
    const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
    await report.truncate(0);
    await report.write(bytes, 0, bytes.length, 0);
    await report.sync();
  };
  await persist();
  try {
    await transferRemoteObjects(exportRoot, store, plan.objects, {
      verifyOnly,
      progress: (count) => {
        evidence.verified = count;
      },
    });
    evidence.status = verifyOnly ? "verified" : "transferred";
    evidence.finishedAt = new Date().toISOString();
    console.log(JSON.stringify({ status: evidence.status, objects: plan.objects.length, releaseCertified: false }));
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "OBJECT_TRANSFER_FAILED_REDACTED";
    process.exitCode = 1;
    console.error(JSON.stringify({ status: "failed", error: evidence.error }));
  } finally {
    await persist().catch(() => undefined);
    await report.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    const message = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "OBJECT_TRANSFER_FAILED_REDACTED";
    console.error(JSON.stringify({ status: "failed", error: message }));
    process.exitCode = 1;
  });
}
