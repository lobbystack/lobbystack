import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertRehearsalTarget } from "./rehearsal-import.ts";

async function main(): Promise<void> {
  const databaseName = process.argv.find((arg) => arg.startsWith("--database="))?.slice(11);
  const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.slice(9);
  const url = process.env.REHEARSAL_DATABASE_URL;
  const workerUrl = process.env.REHEARSAL_WORKER_DATABASE_URL;
  const nonce = process.env.REHEARSAL_TARGET_NONCE;
  if (!databaseName || !url || !workerUrl || !nonce || !reportPath) throw new Error("REHEARSAL_CONFIGURATION_REQUIRED");
  assertRehearsalTarget(url, databaseName);
  const expected = new URL(url);
  const workerTarget = new URL(workerUrl);
  if (workerTarget.username !== "lobbystack_worker" || workerTarget.host !== expected.host || workerTarget.pathname !== expected.pathname || workerTarget.search || workerTarget.hash) throw new Error("WORKER_TARGET_MISMATCH");
  const { createDatabaseClient } = await import("@lobbystack/db");
  const { refreshBusinessSnapshot, loadLatestBusinessSnapshot } = await import("@lobbystack/domain");
  const { snapshotSchema } = await import("@lobbystack/contracts");
  const admin = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: url });
  const worker = createDatabaseClient("lobbystack_worker", { DATABASE_URL: workerUrl });
  const report = await open(reportPath, "wx", 0o600);
  const evidence: Record<string, unknown> = { status: "failed", database: databaseName, startedAt: new Date().toISOString(), releaseCertified: false };
  try {
    const marker = await admin.pool.query("SELECT database_name, nonce FROM migration_control.target");
    if (marker.rows.length !== 1 || marker.rows[0].database_name !== databaseName || marker.rows[0].nonce !== nonce) throw new Error("DATABASE_TARGET_MARKER_MISMATCH");
    const businesses = await admin.pool.query<{ id: string; business_type: string; telemetry_enabled: boolean }>("SELECT id, business_type, telemetry_enabled FROM public.businesses ORDER BY id");
    evidence.businesses = businesses.rows.length;
    if (!process.argv.includes("--apply")) { evidence.status = "planned"; return; }
    const before = await admin.pool.query<{ count: number }>("SELECT count(*)::int AS count FROM public.outbox_messages");
    let rebuilt = 0;
    for (const business of businesses.rows) {
      await refreshBusinessSnapshot({ db: worker.db }, { businessId: business.id });
      const snapshot = snapshotSchema.parse(await loadLatestBusinessSnapshot({ db: worker.db }, { businessId: business.id }));
      const expectedType = ["clinic", "repair_shop", "salon", "service_company"].includes(business.business_type) ? business.business_type : "other";
      if (snapshot.businessId !== business.id || snapshot.businessType !== expectedType || snapshot.telemetryEnabled !== business.telemetry_enabled) throw new Error("REBUILT_SNAPSHOT_FACT_MISMATCH");
      rebuilt++;
    }
    const after = await admin.pool.query<{ count: number }>("SELECT count(*)::int AS count FROM public.outbox_messages");
    const unsafe = await admin.pool.query<{ count: number }>("SELECT count(*)::int AS count FROM public.outbox_messages WHERE topic <> 'realtime.publish'");
    if (unsafe.rows[0]!.count || after.rows[0]!.count - before.rows[0]!.count !== rebuilt) throw new Error("UNEXPECTED_REBUILD_SIDE_EFFECT");
    evidence.status = "passed"; evidence.snapshotsValidated = rebuilt; evidence.realtimeEventsQueued = rebuilt;
  } catch (error) {
    evidence.error = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "REBUILD_FAILED_REDACTED";
    process.exitCode = 1;
  } finally {
    await Promise.all([admin.pool.end(), worker.pool.end()]);
    evidence.finishedAt = new Date().toISOString();
    await report.writeFile(`${JSON.stringify(evidence, null, 2)}\n`); await report.close();
    console.log(JSON.stringify(evidence));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch(() => { console.error("SNAPSHOT_REBUILD_BLOCKED"); process.exitCode = 1; });
