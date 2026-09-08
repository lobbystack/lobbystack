import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { eq } from "drizzle-orm";

import {
  auditLogs,
  appointments,
  billingAccounts,
  billingUsageEvents,
  billingUsageMonths,
  businesses,
  calls,
  contacts,
  conversations,
  createDatabaseClient,
  feedbackSubmissions,
  inboxItems,
  knowledgeDocuments,
  messages,
  notifications,
  operatorNotificationDeliveries,
  smsConsentEvents,
  unitEconomicsEvents,
  users,
} from "@lobbystack/db";

type LegacyRow = Record<string, unknown> & { _id: string };
type ImportBundle = {
  knowledgeDocumentSettings?: LegacyRow[];
  inboxItems?: LegacyRow[];
  billingAccounts?: LegacyRow[];
  billingUsageEvents?: LegacyRow[];
  billingUsageMonths?: LegacyRow[];
  smsConsentEvents?: LegacyRow[];
  feedbackSubmissions?: LegacyRow[];
  auditLogs?: LegacyRow[];
  unitEconomicsEvents?: LegacyRow[];
};

function text(row: LegacyRow, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(row: LegacyRow, key: string): number | undefined {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(row: LegacyRow, key: string): boolean | undefined {
  return typeof row[key] === "boolean" ? row[key] : undefined;
}

function dateValue(row: LegacyRow, key: string): Date | undefined {
  const value = row[key];
  const date = typeof value === "number" || typeof value === "string" ? new Date(value) : undefined;
  return date && Number.isFinite(date.getTime()) ? date : undefined;
}

function objectValue(row: LegacyRow, key: string): Record<string, unknown> | undefined {
  const value = row[key];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

async function legacyMap(rows: Array<{ id: string; legacyConvexId: string | null }>): Promise<Map<string, string>> {
  return new Map(rows.flatMap((row) => row.legacyConvexId ? [[row.legacyConvexId, row.id] as const] : []));
}

function requiredMapping(map: Map<string, string>, row: LegacyRow, field: string): string {
  const legacyId = text(row, field);
  const id = legacyId ? map.get(legacyId) : undefined;
  if (!id) throw new Error(`Missing replacement mapping for ${field}=${legacyId ?? "<empty>"} on ${row._id}.`);
  return id;
}

async function main(): Promise<void> {
  const inputArg = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length);
  if (!inputArg) throw new Error("Usage: pnpm replacement:import -- --input=/path/to/convex-export.json [--dry-run]");
  const bundle = JSON.parse(await readFile(resolve(inputArg), "utf8")) as ImportBundle;
  const dryRun = process.argv.includes("--dry-run");
  const client = createDatabaseClient("lobbystack_migrator");
  const counts: Record<string, number> = {};
  try {
    await client.db.transaction(async (tx) => {
      const [businessMap, userMap, contactMap, appointmentMap, callMap, conversationMap, messageMap, notificationMap, operatorDeliveryMap] = await Promise.all([
        legacyMap(await tx.select({ id: businesses.id, legacyConvexId: businesses.legacyConvexId }).from(businesses)),
        legacyMap(await tx.select({ id: users.id, legacyConvexId: users.legacyConvexId }).from(users)),
        legacyMap(await tx.select({ id: contacts.id, legacyConvexId: contacts.legacyConvexId }).from(contacts)),
        legacyMap(await tx.select({ id: appointments.id, legacyConvexId: appointments.legacyConvexId }).from(appointments)),
        legacyMap(await tx.select({ id: calls.id, legacyConvexId: calls.legacyConvexId }).from(calls)),
        legacyMap(await tx.select({ id: conversations.id, legacyConvexId: conversations.legacyConvexId }).from(conversations)),
        legacyMap(await tx.select({ id: messages.id, legacyConvexId: messages.legacyConvexId }).from(messages)),
        legacyMap(await tx.select({ id: notifications.id, legacyConvexId: notifications.legacyConvexId }).from(notifications)),
        legacyMap(await tx.select({ id: operatorNotificationDeliveries.id, legacyConvexId: operatorNotificationDeliveries.legacyConvexId }).from(operatorNotificationDeliveries)),
      ]);

      // Document bodies/storage are migrated separately; preserve enablement on their existing lineage.
      for (const row of bundle.knowledgeDocumentSettings ?? []) {
        const businessId = requiredMapping(businessMap, row, "businessId");
        const [document] = await tx.select({ id: knowledgeDocuments.id, businessId: knowledgeDocuments.businessId }).from(knowledgeDocuments).where(eq(knowledgeDocuments.legacyConvexId, row._id));
        if (!document || document.businessId !== businessId) throw new Error(`Knowledge settings ${row._id} have no matching tenant document.`);
        await tx.update(knowledgeDocuments).set({ active: booleanValue(row, "active") ?? true }).where(eq(knowledgeDocuments.id, document.id));
        counts.knowledgeDocumentSettings = (counts.knowledgeDocumentSettings ?? 0) + 1;
      }

      for (const row of bundle.inboxItems ?? []) {
        const businessId = requiredMapping(businessMap, row, "businessId");
        const relatedId = text(row, "relatedId");
        const relatedCallId = relatedId && text(row, "kind") === "voice_message" ? requiredMapping(callMap, row, "relatedId") : undefined;
        if (relatedCallId) {
          const [call] = await tx.select({ businessId: calls.businessId }).from(calls).where(eq(calls.id, relatedCallId));
          if (call?.businessId !== businessId) throw new Error(`Inbox item ${row._id} references a call from another business.`);
        }
        const scrubbed = ["expired", "scrubbed"].includes(text(row, "contentRetentionStatus") ?? "active");
        const values = { businessId, legacyConvexId: row._id, kind: text(row, "kind") ?? "voice_message", title: scrubbed ? "Expired voice message" : text(row, "title") ?? "Voice message", body: scrubbed ? "[Expired by 365-day retention policy]" : text(row, "body") ?? "", relatedCallId: relatedCallId ?? null, status: text(row, "status") ?? "open", contentRetentionStatus: scrubbed ? "scrubbed" : "active", contentExpiresAt: dateValue(row, "contentExpiresAt") ?? null, createdAt: dateValue(row, "_creationTime") ?? dateValue(row, "createdAt") ?? new Date(), updatedAt: dateValue(row, "updatedAt") ?? new Date() };
        await tx.insert(inboxItems).values(values).onConflictDoUpdate({ target: inboxItems.legacyConvexId, set: values });
        counts.inboxItems = (counts.inboxItems ?? 0) + 1;
      }

      for (const row of bundle.billingAccounts ?? []) {
        const businessId = requiredMapping(businessMap, row, "businessId");
        await tx.insert(billingAccounts).values({ businessId, legacyConvexId: row._id, billingKey: text(row, "billingKey") ?? `business:${businessId}`, source: text(row, "source") ?? "polar", customerId: text(row, "customerId"), subscriptionId: text(row, "subscriptionId"), plan: text(row, "plan"), billingInterval: text(row, "billingInterval"), subscriptionState: text(row, "subscriptionState"), currentPeriodStart: dateValue(row, "currentPeriodStart"), currentPeriodEnd: dateValue(row, "currentPeriodEnd"), overageSpendingCapCents: numberValue(row, "overageSpendingCapCents") }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { legacyConvexId: row._id, customerId: text(row, "customerId"), subscriptionId: text(row, "subscriptionId"), plan: text(row, "plan"), billingInterval: text(row, "billingInterval"), subscriptionState: text(row, "subscriptionState"), currentPeriodStart: dateValue(row, "currentPeriodStart"), currentPeriodEnd: dateValue(row, "currentPeriodEnd"), overageSpendingCapCents: numberValue(row, "overageSpendingCapCents"), updatedAt: new Date() } });
        counts.billingAccounts = (counts.billingAccounts ?? 0) + 1;
      }

      for (const row of bundle.billingUsageEvents ?? []) {
        const businessId = requiredMapping(businessMap, row, "businessId");
        await tx.insert(billingUsageEvents).values({ businessId, legacyConvexId: row._id, periodKey: text(row, "periodKey") ?? "unknown", sourceKey: text(row, "sourceKey") ?? `legacy:${row._id}`, usageKind: text(row, "usageKind") ?? "unknown", quantity: numberValue(row, "quantity") ?? 0, billableQuantity: numberValue(row, "billableQuantity"), planAtRecordTime: text(row, "planAtRecordTime"), billingIntervalAtRecordTime: text(row, "billingIntervalAtRecordTime"), isFinal: booleanValue(row, "isFinal") ?? true, syncStatus: "skipped", createdAt: dateValue(row, "createdAt") }).onConflictDoUpdate({ target: [billingUsageEvents.businessId, billingUsageEvents.sourceKey], set: { legacyConvexId: row._id, quantity: numberValue(row, "quantity") ?? 0, billableQuantity: numberValue(row, "billableQuantity"), planAtRecordTime: text(row, "planAtRecordTime"), billingIntervalAtRecordTime: text(row, "billingIntervalAtRecordTime"), isFinal: booleanValue(row, "isFinal") ?? true, updatedAt: new Date() } });
        counts.billingUsageEvents = (counts.billingUsageEvents ?? 0) + 1;
      }

      for (const row of bundle.billingUsageMonths ?? []) {
        const businessId = requiredMapping(businessMap, row, "businessId");
        const periodKey = text(row, "periodKey") ?? "unknown";
        const values = { businessId, periodKey, planAtSnapshot: text(row, "planAtSnapshot"), voiceSecondsUsed: numberValue(row, "voiceSecondsUsed") ?? 0, alertSmsSegmentsUsed: numberValue(row, "alertSmsSegmentsUsed") ?? 0, outboundCallAttemptsUsed: numberValue(row, "outboundCallAttemptsUsed") ?? 0, voiceBlocked: booleanValue(row, "voiceBlocked") ?? false, alertSmsBlocked: booleanValue(row, "alertSmsBlocked") ?? false, outboundCallAttemptsBlocked: booleanValue(row, "outboundCallAttemptsBlocked") ?? false, overageSpendCents: numberValue(row, "overageSpendCents") ?? 0, lastRecordedAt: dateValue(row, "lastRecordedAt") ?? new Date() };
        await tx.insert(billingUsageMonths).values(values).onConflictDoUpdate({ target: [billingUsageMonths.businessId, billingUsageMonths.periodKey], set: { ...values, updatedAt: new Date() } });
        counts.billingUsageMonths = (counts.billingUsageMonths ?? 0) + 1;
      }

      for (const row of bundle.smsConsentEvents ?? []) {
        const businessId = requiredMapping(businessMap, row, "businessId");
        const contactId = text(row, "contactId") ? contactMap.get(text(row, "contactId")!) : undefined;
        const action = text(row, "action") ?? "legacy";
        const occurredAt = dateValue(row, "occurredAt") ?? dateValue(row, "createdAt") ?? new Date();
        await tx.insert(smsConsentEvents).values({ businessId, legacyConvexId: row._id, contactId, phone: text(row, "phone") ?? "unknown", recipientType: text(row, "recipientType") ?? "contact", action, source: text(row, "source") ?? "convex_import", occurredAt }).onConflictDoNothing({ target: smsConsentEvents.legacyConvexId });
        if (contactId && action === "opted_out") await tx.update(contacts).set({ smsConsentStatus: "opted_out", smsConsentSource: text(row, "source") ?? "convex_import", smsConsentUpdatedAt: occurredAt }).where(eq(contacts.id, contactId));
        if (contactId && ["resubscribed", "reminder_consent_granted"].includes(action)) await tx.update(contacts).set({ smsConsentStatus: "subscribed", smsConsentSource: text(row, "source") ?? "convex_import", smsConsentUpdatedAt: occurredAt }).where(eq(contacts.id, contactId));
        if (contactId && action === "manual_blocked") await tx.update(contacts).set({ operatorBlockedAt: occurredAt }).where(eq(contacts.id, contactId));
        if (contactId && action === "manual_unblocked") await tx.update(contacts).set({ operatorBlockedAt: null }).where(eq(contacts.id, contactId));
        counts.smsConsentEvents = (counts.smsConsentEvents ?? 0) + 1;
      }

      for (const row of bundle.feedbackSubmissions ?? []) {
        const userId = requiredMapping(userMap, row, "userId");
        const businessLegacyId = text(row, "businessId");
        const businessId = businessLegacyId ? businessMap.get(businessLegacyId) : undefined;
        await tx.insert(feedbackSubmissions).values({ userId, legacyConvexId: row._id, businessId, userEmail: text(row, "userEmail"), userName: text(row, "userName"), businessName: text(row, "businessName"), message: text(row, "message") ?? "Imported feedback", pagePath: text(row, "pagePath"), userAgent: text(row, "userAgent"), emailStatus: text(row, "emailStatus") ?? "email_sent", recipientEmail: text(row, "recipientEmail"), providerMessageId: text(row, "providerMessageId"), emailError: text(row, "emailError"), submittedAt: dateValue(row, "submittedAt") ?? dateValue(row, "createdAt") ?? new Date(), emailedAt: dateValue(row, "emailedAt") }).onConflictDoUpdate({ target: feedbackSubmissions.legacyConvexId, set: { emailStatus: text(row, "emailStatus") ?? "email_sent", providerMessageId: text(row, "providerMessageId"), emailError: text(row, "emailError"), emailedAt: dateValue(row, "emailedAt"), updatedAt: new Date() } });
        counts.feedbackSubmissions = (counts.feedbackSubmissions ?? 0) + 1;
      }

      for (const row of bundle.auditLogs ?? []) {
        const businessId = requiredMapping(businessMap, row, "businessId");
        const actorLegacyId = text(row, "actorUserId");
        const entityType = text(row, "entityType") ?? "legacy";
        const entityLegacyId = text(row, "entityId");
        const entityMap = entityType === "appointment" || entityType === "appointment_change" ? appointmentMap : entityType === "call" ? callMap : entityType === "conversation" ? conversationMap : entityType === "message" ? messageMap : entityType === "contact" ? contactMap : undefined;
        await tx.insert(auditLogs).values({ businessId, legacyConvexId: row._id, actorUserId: actorLegacyId ? userMap.get(actorLegacyId) : undefined, eventType: text(row, "eventType") ?? "legacy.imported", entityType, entityId: entityLegacyId ? entityMap?.get(entityLegacyId) : undefined, payload: objectValue(row, "payload"), createdAt: dateValue(row, "createdAt") }).onConflictDoUpdate({ target: auditLogs.legacyConvexId, set: { payload: objectValue(row, "payload"), updatedAt: new Date() } });
        counts.auditLogs = (counts.auditLogs ?? 0) + 1;
      }

      for (const row of bundle.unitEconomicsEvents ?? []) {
        const businessId = requiredMapping(businessMap, row, "businessId");
        const occurredAt = dateValue(row, "occurredAt") ?? dateValue(row, "createdAt") ?? new Date();
        await tx.insert(unitEconomicsEvents).values({ businessId, legacyConvexId: row._id, monthKey: text(row, "monthKey") ?? occurredAt.toISOString().slice(0, 7), occurredAt, eventKey: text(row, "eventKey") ?? `legacy:${row._id}`, eventKind: text(row, "eventKind") ?? "legacy", channel: text(row, "channel") ?? "unknown", costUsd: numberValue(row, "costUsd") ?? 0, quantity: numberValue(row, "quantity"), quantityUnit: text(row, "quantityUnit"), provider: text(row, "provider"), model: text(row, "model"), operation: text(row, "operation"), callId: text(row, "callId") ? callMap.get(text(row, "callId")!) : undefined, conversationId: text(row, "conversationId") ? conversationMap.get(text(row, "conversationId")!) : undefined, messageId: text(row, "messageId") ? messageMap.get(text(row, "messageId")!) : undefined, notificationId: text(row, "notificationId") ? notificationMap.get(text(row, "notificationId")!) : undefined, operatorNotificationDeliveryId: text(row, "operatorNotificationDeliveryId") ? operatorDeliveryMap.get(text(row, "operatorNotificationDeliveryId")!) : undefined }).onConflictDoUpdate({ target: [unitEconomicsEvents.businessId, unitEconomicsEvents.eventKey], set: { legacyConvexId: row._id, costUsd: numberValue(row, "costUsd") ?? 0, quantity: numberValue(row, "quantity"), updatedAt: new Date() } });
        counts.unitEconomicsEvents = (counts.unitEconomicsEvents ?? 0) + 1;
      }

      if (dryRun) throw new Error("__ROLLBACK_DRY_RUN__");
    }).catch((error) => {
      if (!(dryRun && error instanceof Error && error.message === "__ROLLBACK_DRY_RUN__")) throw error;
    });
    console.log(JSON.stringify({ dryRun, imported: counts }, null, 2));
  } finally {
    await client.pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
