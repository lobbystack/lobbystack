import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { businesses, createDatabaseClient, unitEconomicsEvents, unitEconomicsRollups, withBusinessTransaction } from "@lobbystack/db";
import { recordUnitEconomicsEvent, refreshUnitEconomicsMonth } from "@lobbystack/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const migrator = createDatabaseClient("lobbystack_migrator");
  const worker = createDatabaseClient("lobbystack_worker");
  const businessId = randomUUID();
  const foreignBusinessId = randomUUID();
  const month = "2026-08";
  try {
    await migrator.db.insert(businesses).values([{ id: businessId, slug: `economics-${businessId}`, name: "Unit economics certification", timezone: "UTC", businessType: "test" }, { id: foreignBusinessId, slug: `economics-${foreignBusinessId}`, name: "Foreign economics certification", timezone: "UTC", businessType: "test" }]);
    await recordUnitEconomicsEvent({ db: worker.db }, { businessId, eventKey: "shared-provider-key", eventKind: "voice_provider", channel: "voice", costUsd: 0.05, occurredAt: new Date("2026-08-31T23:59:00Z"), quantity: 60, quantityUnit: "second", provider: "twilio_estimate" });
    await recordUnitEconomicsEvent({ db: worker.db }, { businessId: foreignBusinessId, eventKey: "shared-provider-key", eventKind: "voice_provider", channel: "voice", costUsd: 0.02, occurredAt: new Date("2026-08-01T00:00:00Z"), provider: "twilio" });
    await recordUnitEconomicsEvent({ db: worker.db }, { businessId, eventKey: "shared-provider-key", eventKind: "voice_provider", channel: "voice", costUsd: 0.08, occurredAt: new Date("2026-08-31T23:59:00Z"), quantity: 60, quantityUnit: "second", provider: "twilio" });
    await recordUnitEconomicsEvent({ db: worker.db }, { businessId, eventKey: "operator-alert", eventKind: "operator_notification_provider", channel: "sms", costUsd: 0.01, occurredAt: new Date("2026-08-15T00:00:00Z"), quantity: 1, quantityUnit: "segment", provider: "twilio" });
    await recordUnitEconomicsEvent({ db: worker.db }, { businessId, eventKey: "voice-ai", eventKind: "voice_ai", channel: "voice", costUsd: 0.03, occurredAt: new Date("2026-08-15T00:00:00Z") });
    await recordUnitEconomicsEvent({ db: worker.db }, { businessId, eventKey: "excluded-sms-ai", eventKind: "sms_ai", channel: "sms", costUsd: 99, occurredAt: new Date("2026-08-15T00:00:00Z") });
    await recordUnitEconomicsEvent({ db: worker.db }, { businessId, eventKey: "next-month", eventKind: "voice_provider", channel: "voice", costUsd: 10, occurredAt: new Date("2026-09-01T00:00:00Z") });

    await refreshUnitEconomicsMonth({ db: worker.db }, { businessId, monthKey: month });
    let rollup = (await migrator.db.select().from(unitEconomicsRollups).where(and(eq(unitEconomicsRollups.businessId, businessId), eq(unitEconomicsRollups.monthKey, month))).limit(1))[0];
    assert(rollup?.providerCostUsd === 0.09, "Final provider pricing or operator alert cost was not rolled up.");
    assert(rollup.aiCostUsd === 0.03 && rollup.totalCostUsd === 0.12, "AI SMS was included or non-SMS AI cost was omitted.");
    assert(rollup.voiceMinutes === 1 && rollup.alertSmsCostUsd === 0.01, "Unit quantities were not rolled up correctly.");
    const providerRows = await migrator.db.select().from(unitEconomicsEvents).where(and(eq(unitEconomicsEvents.businessId, businessId), eq(unitEconomicsEvents.eventKey, "shared-provider-key")));
    assert(providerRows.length === 1 && providerRows[0]?.provider === "twilio" && providerRows[0].costUsd === 0.08, "Final pricing did not replace the estimate idempotently.");

    await recordUnitEconomicsEvent({ db: worker.db }, { businessId, eventKey: "late-backfill", eventKind: "notification_provider", channel: "sms", costUsd: 0.02, occurredAt: new Date("2026-08-10T00:00:00Z"), provider: "twilio" });
    await refreshUnitEconomicsMonth({ db: worker.db }, { businessId, monthKey: month });
    rollup = (await migrator.db.select().from(unitEconomicsRollups).where(and(eq(unitEconomicsRollups.businessId, businessId), eq(unitEconomicsRollups.monthKey, month))).limit(1))[0];
    assert(rollup?.providerCostUsd === 0.11, "Late pricing backfill was not included after deterministic recomputation.");

    const leaked = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => await tx.select({ id: unitEconomicsEvents.id }).from(unitEconomicsEvents).where(eq(unitEconomicsEvents.businessId, foreignBusinessId)));
    assert(leaked.length === 0, "Unit economics RLS exposed a foreign tenant.");
    console.log(JSON.stringify({ estimatesReplaced: true, repeatedCallbacksIdempotent: true, aiSmsExcluded: true, operatorAlertsIncluded: true, lateBackfillsRecomputed: true, monthBoundariesPreserved: true, rlsIsolated: true }));
  } finally {
    await migrator.db.delete(businesses).where(eq(businesses.id, businessId)).catch(() => undefined);
    await migrator.db.delete(businesses).where(eq(businesses.id, foreignBusinessId)).catch(() => undefined);
    await Promise.all([migrator.pool.end(), worker.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
