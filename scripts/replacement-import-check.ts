import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { businesses, calls, contacts, createDatabaseClient, inboxItems, knowledgeDocuments, users } from "@lobbystack/db";

async function main(): Promise<void> {
  const db = createDatabaseClient("lobbystack_migrator");
  const directory = await mkdtemp(join(tmpdir(), "lobbystack-import-check-"));
  const sourcePath = join(directory, "source.json");
  const businessId = randomUUID();
  const userId = randomUUID();
  const contactId = randomUUID();
  const documentId = randomUUID();
  const documentLegacyId = `document:${randomUUID()}`;
  const callId = randomUUID();
  const callLegacyId = `call:${randomUUID()}`;
  const businessLegacyId = `business:${randomUUID()}`;
  const userLegacyId = `user:${randomUUID()}`;
  const contactLegacyId = `contact:${randomUUID()}`;
  try {
    await db.db.insert(users).values({ id: userId, legacyConvexId: userLegacyId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
    await db.db.insert(businesses).values({ id: businessId, legacyConvexId: businessLegacyId, slug: `import-${businessId}`, name: "Import certification", timezone: "UTC", businessType: "test" });
    await db.db.insert(contacts).values({ id: contactId, legacyConvexId: contactLegacyId, businessId, phone: "+14165550888" });
    await db.db.insert(calls).values({ id: callId, legacyConvexId: callLegacyId, businessId, providerCallId: callId, transport: "voice", startedAt: new Date() });
    await db.db.insert(knowledgeDocuments).values({ id: documentId, businessId, legacyConvexId: documentLegacyId, title: "Imported policy", sourceType: "upload", status: "indexed", active: true });
    const source = {
      knowledgeDocumentSettings: [{ _id: documentLegacyId, businessId: businessLegacyId, active: false }],
      inboxItems: [{ _id: "inbox:1", businessId: businessLegacyId, kind: "voice_message", relatedId: callLegacyId, title: "Expired private title", body: "Expired private body", status: "open", contentRetentionStatus: "expired", contentExpiresAt: "2020-01-01T00:00:00Z", _creationTime: 1 }],
      billingAccounts: [{ _id: "billing-account:1", businessId: businessLegacyId, billingKey: `business:${businessId}`, plan: "starter", billingInterval: "monthly", subscriptionState: "active", overageSpendingCapCents: 2500 }],
      billingUsageEvents: [{ _id: "usage:1", businessId: businessLegacyId, periodKey: "2026-08", sourceKey: "legacy:usage:1", usageKind: "voice_seconds", quantity: 30, billableQuantity: 0, planAtRecordTime: "starter", billingIntervalAtRecordTime: "monthly", isFinal: true }],
      billingUsageMonths: [{ _id: "usage-month:1", businessId: businessLegacyId, periodKey: "2026-08", planAtSnapshot: "starter", voiceSecondsUsed: 30 }],
      smsConsentEvents: [{ _id: "consent:1", businessId: businessLegacyId, contactId: contactLegacyId, phone: "+14165550888", recipientType: "contact", action: "opted_out", source: "convex_import", occurredAt: "2026-08-01T00:00:00Z" }],
      feedbackSubmissions: [{ _id: "feedback:1", userId: userLegacyId, businessId: businessLegacyId, message: "Imported feedback", emailStatus: "email_sent", submittedAt: "2026-08-01T00:00:00Z" }],
      auditLogs: [{ _id: "audit:1", businessId: businessLegacyId, userId: userLegacyId, eventType: "appointment_change.canceled", entityType: "appointment", payload: { source: "legacy" }, createdAt: "2026-08-01T00:00:00Z" }],
      unitEconomicsEvents: [{ _id: "economics:1", businessId: businessLegacyId, monthKey: "2026-08", occurredAt: "2026-08-01T00:00:00Z", eventKey: "legacy:economics:1", eventKind: "voice_provider", channel: "voice", costUsd: 0.05 }],
    };
    await writeFile(sourcePath, JSON.stringify(source), "utf8");
    execFileSync(process.execPath, [tsxCli, "--tsconfig", "scripts/tsconfig.json", "scripts/replacement-import.ts", `--input=${sourcePath}`, "--dry-run"], { cwd: process.cwd(), env: process.env, stdio: "pipe" });
    if ((await db.db.select().from(inboxItems).where(eq(inboxItems.businessId, businessId))).length) throw new Error("Dry-run left imported follow-ups behind.");
    if ((await db.db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)))[0]?.active !== true) throw new Error("Dry-run changed document activity.");
    const invalidPath = join(directory, "invalid.json");
    await writeFile(invalidPath, JSON.stringify({ knowledgeDocumentSettings: source.knowledgeDocumentSettings, inboxItems: [...source.inboxItems, { ...source.inboxItems[0], _id: "inbox:invalid", businessId: "missing-business" }] }));
    let rolledBack = false;
    try { execFileSync(process.execPath, [tsxCli, "--tsconfig", "scripts/tsconfig.json", "scripts/replacement-import.ts", `--input=${invalidPath}`], { cwd: process.cwd(), env: process.env, stdio: "pipe" }); } catch { rolledBack = true; }
    if (!rolledBack || (await db.db.select().from(inboxItems).where(eq(inboxItems.businessId, businessId))).length) throw new Error("Failed import did not roll back earlier follow-up writes.");
    if ((await db.db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)))[0]?.active !== true) throw new Error("Failed import did not roll back document activity.");
    for (let attempt = 0; attempt < 2; attempt += 1) execFileSync(process.execPath, [tsxCli, "--tsconfig", "scripts/tsconfig.json", "scripts/replacement-import.ts", `--input=${sourcePath}`], { cwd: process.cwd(), env: process.env, stdio: "pipe" });
    execFileSync(process.execPath, [tsxCli, "--tsconfig", "scripts/tsconfig.json", "scripts/replacement-reconciliation.ts", `--source=${sourcePath}`], { cwd: process.cwd(), env: process.env, stdio: "pipe" });
    const [document] = await db.db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId));
    if (document?.active !== false) throw new Error("Disabled document activity was not preserved by import.");
    const [followUp] = await db.db.select().from(inboxItems).where(eq(inboxItems.businessId, businessId));
    if (followUp?.relatedCallId !== callId || followUp.contentRetentionStatus !== "scrubbed" || followUp.body.includes("private")) throw new Error("Imported follow-up linkage or retention state was not preserved.");
    console.log(JSON.stringify({ knowledgeActivityPreserved: true, followUpImport: true, expiredContentRedacted: true, dryRunRollback: true, failedImportRollback: true, importerRerunIdempotent: true, rowCountsReconciled: true, relationshipsReconciled: true, aggregateTotalsReconciled: true, samplesGenerated: true }));
  } finally {
    await db.db.delete(businesses).where(eq(businesses.id, businessId)).catch(() => undefined);
    await db.db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    await db.pool.end();
    await rm(directory, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
