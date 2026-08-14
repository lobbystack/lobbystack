import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { billingAccounts, billingUsageEvents, businessMemberships, businesses, createDatabaseClient, users } from "@lobbystack/db";
import { correctAlertSmsUsage, getBillingUsageStatus, reserveAlertSmsUsage, reserveOutboundCallAttempt, setOverageSpendingCap } from "@lobbystack/domain";
import { billingPlanCatalog } from "@lobbystack/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const migrator = createDatabaseClient("lobbystack_migrator");
  const worker = createDatabaseClient("lobbystack_worker");
  const app = createDatabaseClient("lobbystack_app");
  const businessId = randomUUID();
  const annualBusinessId = randomUUID();
  const concurrentBusinessId = randomUUID();
  const userId = randomUUID();
  const unauthorizedUserId = randomUUID();
  try {
    await migrator.db.insert(users).values([{ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` }, { id: unauthorizedUserId, email: `${unauthorizedUserId}@example.invalid`, normalizedEmail: `${unauthorizedUserId}@example.invalid` }]);
    await migrator.db.insert(businesses).values([{ id: businessId, slug: `billing-${businessId}`, name: "Billing certification", timezone: "UTC", businessType: "test" }, { id: annualBusinessId, slug: `billing-${annualBusinessId}`, name: "Annual billing certification", timezone: "UTC", businessType: "test" }, { id: concurrentBusinessId, slug: `billing-${concurrentBusinessId}`, name: "Concurrent billing certification", timezone: "UTC", businessType: "test" }]);
    await migrator.db.insert(businessMemberships).values([{ businessId, userId, role: "business_owner" }, { businessId: annualBusinessId, userId, role: "business_owner" }, { businessId: concurrentBusinessId, userId, role: "business_owner" }]);
    await migrator.db.insert(billingAccounts).values([{ businessId, billingKey: `business:${businessId}`, plan: "starter", billingInterval: "monthly", subscriptionState: "active" }, { businessId: annualBusinessId, billingKey: `business:${annualBusinessId}`, plan: "starter", billingInterval: "annual", subscriptionState: "active" }, { businessId: concurrentBusinessId, billingKey: `business:${concurrentBusinessId}`, plan: "starter", billingInterval: "monthly", subscriptionState: "active" }]);

    const context = { db: worker.db };
    const sourceKey = `alert_sms:test:${businessId}:included`;
    const included = await reserveAlertSmsUsage(context, { businessId, sourceKey, estimatedSegments: 1 });
    const retry = await reserveAlertSmsUsage(context, { businessId, sourceKey, estimatedSegments: 1 });
    assert(included.allowed && retry.usageEventId === included.usageEventId, "Deterministic retry created a second usage reservation.");
    const duplicateCount = await migrator.db.select().from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.sourceKey, sourceKey)));
    assert(duplicateCount.length === 1, "Usage retry double-charged.");
    const transfer = await reserveOutboundCallAttempt(context, { businessId, sourceKey: `outbound_call:test:${businessId}` });
    assert(transfer.allowed, "Included transfer attempt was rejected.");

    const cap = await setOverageSpendingCap({ db: app.db }, { userId, businessId, capCents: 0 });
    assert(cap.overageSpendingCapCents === 0, "Zero-dollar overage cap was not persisted.");
    const overCap = await reserveAlertSmsUsage(context, { businessId, sourceKey: `alert_sms:test:${businessId}:over-cap`, estimatedSegments: (billingPlanCatalog.starter.alertSmsSegmentsIncluded ?? 0) + 1 });
    assert(!overCap.allowed && overCap.errorCode === "alert_sms_limit_reached", "Alert SMS reservation bypassed the shared zero-dollar cap.");
    let unauthorizedDenied = false;
    try { await setOverageSpendingCap({ db: app.db }, { userId: unauthorizedUserId, businessId, capCents: 100 }); } catch { unauthorizedDenied = true; }
    assert(unauthorizedDenied, "Non-admin user changed the overage cap.");
    await setOverageSpendingCap({ db: app.db }, { userId, businessId, capCents: null });
    const afterRemoval = await reserveAlertSmsUsage(context, { businessId, sourceKey: `alert_sms:test:${businessId}:cap-removed`, estimatedSegments: (billingPlanCatalog.starter.alertSmsSegmentsIncluded ?? 0) + 1 });
    assert(afterRemoval.allowed, "Removing the cap did not restore paid overage usage.");

    const planSource = `alert_sms:test:${businessId}:plan-snapshot`;
    await reserveAlertSmsUsage(context, { businessId, sourceKey: planSource, estimatedSegments: 1 });
    await migrator.db.update(billingAccounts).set({ plan: "pro" }).where(eq(billingAccounts.businessId, businessId));
    await correctAlertSmsUsage(context, { businessId, sourceKey: planSource, segments: 2 });
    const planEvent = (await migrator.db.select().from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.sourceKey, planSource))).limit(1))[0];
    assert(planEvent?.planAtRecordTime === "starter", "Usage correction lost plan-at-event pricing after a plan change.");

    const annualIncluded = billingPlanCatalog.starter.alertSmsSegmentsIncluded ?? 0;
    const annual = await reserveAlertSmsUsage(context, { businessId: annualBusinessId, sourceKey: `alert_sms:annual:${annualBusinessId}`, estimatedSegments: annualIncluded + 2 });
    assert(annual.allowed, "Annual-plan overage reservation was rejected.");
    const annualEvent = (await migrator.db.select().from(billingUsageEvents).where(eq(billingUsageEvents.id, annual.usageEventId!)).limit(1))[0];
    assert(annualEvent?.billingIntervalAtRecordTime === "annual" && annualEvent.billableQuantity === 2, "Annual-plan billable quantity was not isolated from included usage.");

    const concurrentIncluded = billingPlanCatalog.starter.alertSmsSegmentsIncluded ?? 0;
    await correctAlertSmsUsage(context, { businessId: concurrentBusinessId, sourceKey: `alert_sms:concurrent:${concurrentBusinessId}:included`, segments: concurrentIncluded });
    const perSegmentCents = billingPlanCatalog.starter.alertSmsOverageRatePerSegmentCents ?? 1;
    await setOverageSpendingCap({ db: app.db }, { userId, businessId: concurrentBusinessId, capCents: perSegmentCents });
    const concurrent = await Promise.all([
      reserveAlertSmsUsage(context, { businessId: concurrentBusinessId, sourceKey: `alert_sms:concurrent:${concurrentBusinessId}:a`, estimatedSegments: 1 }),
      reserveAlertSmsUsage(context, { businessId: concurrentBusinessId, sourceKey: `alert_sms:concurrent:${concurrentBusinessId}:b`, estimatedSegments: 1 }),
    ]);
    assert(concurrent.filter((result) => result.allowed).length === 1, "Concurrent reservations exceeded the shared spending cap.");

    const status = await getBillingUsageStatus(context, { businessId });
    assert(status.usageComplete === false && status.overageSpendingCapCents === null, "Billing status did not expose completeness or cap removal.");
    console.log(JSON.stringify({ multiKindMetering: true, zeroDollarCap: true, annualAccounting: true, planSnapshotPreserved: true, concurrentReservationsSerialized: true, unauthorizedChangeDenied: true, retriesIdempotent: true, capRemovalRestoredOverages: true, completenessReported: true }));
  } finally {
    for (const id of [businessId, annualBusinessId, concurrentBusinessId]) await migrator.db.delete(businesses).where(eq(businesses.id, id)).catch(() => undefined);
    await migrator.db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    await migrator.db.delete(users).where(eq(users.id, unauthorizedUserId)).catch(() => undefined);
    await Promise.all([migrator.pool.end(), worker.pool.end(), app.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
