import { and, asc, eq, sql } from "drizzle-orm";

import { businessMemberships, businesses, enqueueOutbox, unitEconomicsEvents, unitEconomicsRollups, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

export type UnitEconomicsEventInput = {
  businessId: string;
  eventKey: string;
  eventKind: string;
  channel: string;
  costUsd?: number | null | undefined;
  occurredAt?: Date;
  quantity?: number;
  quantityUnit?: string;
  provider?: string;
  model?: string;
  operation?: string;
  pricingVersion?: string;
  pricingSource?: string;
  pricingEffectiveDate?: string;
  pricingRates?: Record<string, number>;
  tokenUsage?: Record<string, number>;
  callId?: string;
  conversationId?: string;
  messageId?: string;
  notificationId?: string;
  operatorNotificationDeliveryId?: string;
};

function monthKey(value: Date): string {
  return value.toISOString().slice(0, 7);
}

function safeCost(value: number | null | undefined): number | null {
  return value !== undefined && value !== null && Number.isFinite(value) && value >= 0 ? Math.round(value * 1_000_000) / 1_000_000 : null;
}

function roundUsd(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000) / 1_000_000;
}

function roundUnitCost(total: number, denominator: number): number {
  return denominator > 0 ? roundUsd(total / denominator) : 0;
}

function configuredMonthlyInfraCostUsd(): number {
  const databaseCost = Number(process.env.UNIT_ECONOMICS_MONTHLY_DATABASE_COST_USD ?? "0");
  const hostingCost = Number(process.env.UNIT_ECONOMICS_MONTHLY_HOSTING_COST_USD ?? "0");
  const storageCost = Number(process.env.UNIT_ECONOMICS_MONTHLY_STORAGE_COST_USD ?? "0");
  return roundUsd([databaseCost, hostingCost, storageCost].reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0));
}

export async function recordUnitEconomicsEventInTransaction(tx: DatabaseTransaction, input: UnitEconomicsEventInput): Promise<string> {
  const occurredAt = input.occurredAt ?? new Date();
  const values = {
    businessId: input.businessId,
    monthKey: monthKey(occurredAt),
    occurredAt,
    eventKey: input.eventKey,
    eventKind: input.eventKind,
    channel: input.channel,
    costUsd: safeCost(input.costUsd),
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
    ...(input.quantityUnit !== undefined ? { quantityUnit: input.quantityUnit } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
    ...(input.pricingVersion !== undefined ? { pricingVersion: input.pricingVersion } : {}),
    ...(input.pricingSource !== undefined ? { pricingSource: input.pricingSource } : {}),
    ...(input.pricingEffectiveDate !== undefined ? { pricingEffectiveDate: input.pricingEffectiveDate } : {}),
    ...(input.pricingRates !== undefined ? { pricingRates: input.pricingRates } : {}),
    ...(input.tokenUsage !== undefined ? { tokenUsage: input.tokenUsage } : {}),
    ...(input.callId !== undefined ? { callId: input.callId } : {}),
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    ...(input.notificationId !== undefined ? { notificationId: input.notificationId } : {}),
    ...(input.operatorNotificationDeliveryId !== undefined ? { operatorNotificationDeliveryId: input.operatorNotificationDeliveryId } : {}),
    updatedAt: new Date(),
  };
  const [event] = await tx.insert(unitEconomicsEvents).values(values).onConflictDoUpdate({ target: [unitEconomicsEvents.businessId, unitEconomicsEvents.eventKey], set: { monthKey: values.monthKey, occurredAt, eventKind: input.eventKind, channel: input.channel, costUsd: values.costUsd, ...(input.quantity !== undefined ? { quantity: input.quantity } : {}), ...(input.quantityUnit !== undefined ? { quantityUnit: input.quantityUnit } : {}), ...(input.provider !== undefined ? { provider: input.provider } : {}), ...(input.model !== undefined ? { model: input.model } : {}), ...(input.operation !== undefined ? { operation: input.operation } : {}), ...(input.pricingVersion !== undefined ? { pricingVersion: input.pricingVersion } : {}), ...(input.pricingSource !== undefined ? { pricingSource: input.pricingSource } : {}), ...(input.pricingEffectiveDate !== undefined ? { pricingEffectiveDate: input.pricingEffectiveDate } : {}), ...(input.pricingRates !== undefined ? { pricingRates: input.pricingRates } : {}), ...(input.tokenUsage !== undefined ? { tokenUsage: input.tokenUsage } : {}), ...(input.callId !== undefined ? { callId: input.callId } : {}), ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}), ...(input.messageId !== undefined ? { messageId: input.messageId } : {}), updatedAt: new Date() } }).returning({ id: unitEconomicsEvents.id });
  if (!event) throw new Error("Unit economics event could not be recorded.");
  await enqueueOutbox(tx, { topic: "billing.refreshUnitEconomics", businessId: input.businessId, aggregateType: "unit_economics_event", aggregateId: event.id, dedupeKey: `unit-economics:${event.id}:${values.monthKey}:${values.costUsd}`, payload: { monthKey: values.monthKey } });
  return event.id;
}

export async function recordUnitEconomicsEvent(context: DomainContext, input: UnitEconomicsEventInput): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await recordUnitEconomicsEventInTransaction(tx, input));
}

export async function refreshUnitEconomicsMonth(context: DomainContext, input: { businessId: string; monthKey?: string }): Promise<string> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const targetMonth = input.monthKey ?? monthKey(new Date());
    const events = await tx.select().from(unitEconomicsEvents).where(and(eq(unitEconomicsEvents.businessId, input.businessId), eq(unitEconomicsEvents.monthKey, targetMonth))).orderBy(asc(unitEconomicsEvents.occurredAt));
    const providerCostUsd = roundUsd(events.filter((event) => event.eventKind === "voice_provider" || event.eventKind === "sms_provider" || event.eventKind === "notification_provider" || event.eventKind === "operator_notification_provider").reduce((sum, event) => sum + (event.costUsd ?? 0), 0));
    const aiCostUsd = roundUsd(events.filter((event) => event.eventKind === "voice_ai" || event.eventKind === "dashboard_ai").reduce((sum, event) => sum + (event.costUsd ?? 0), 0));
    const voiceEvents = events.filter((event) => event.channel === "voice");
    const alertSmsEvents = events.filter((event) => event.eventKind === "notification_provider" || event.eventKind === "operator_notification_provider");
    const smsEvents = events.filter((event) => event.channel === "sms");
    const voiceCallCount = new Set(voiceEvents.filter((event) => event.callId !== null).map((event) => event.callId)).size;
    const outboundSmsCount = new Set(smsEvents.filter((event) => event.messageId !== null).map((event) => event.messageId)).size;
    const smsThreadCount = new Set(smsEvents.filter((event) => event.conversationId !== null).map((event) => event.conversationId)).size;
    const voiceMinutes = roundUsd(voiceEvents.reduce((sum, event) => sum + (event.quantityUnit === "second" ? (event.quantity ?? 0) / 60 : event.quantityUnit === "minute" ? event.quantity ?? 0 : 0), 0));
    const voiceCostUsd = roundUsd(voiceEvents.reduce((sum, event) => sum + (event.costUsd ?? 0), 0));
    const smsCostUsd = roundUsd(smsEvents.reduce((sum, event) => sum + (event.costUsd ?? 0), 0));
    const alertSmsCostUsd = roundUsd(alertSmsEvents.reduce((sum, event) => sum + (event.costUsd ?? 0), 0));
    const activeUsers = await tx.select({ count: sql<string>`count(distinct ${businessMemberships.userId})` }).from(businessMemberships).where(and(eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")));
    const activeUserCount = Number(activeUsers[0]?.count ?? 0);
    const activeBusinesses = await tx.select({ count: sql<string>`count(*)` }).from(businesses).where(eq(businesses.status, "active"));
    const infraCostUsd = events.length > 0 ? roundUnitCost(configuredMonthlyInfraCostUsd(), Math.max(1, Number(activeBusinesses[0]?.count ?? 0))) : 0;
    const totalCostUsd = roundUsd(providerCostUsd + aiCostUsd + infraCostUsd);
    const rollupValues = { businessId: input.businessId, monthKey: targetMonth, totalCostUsd, providerCostUsd, aiCostUsd, infraCostUsd, voiceCostUsd, smsCostUsd, alertSmsCostUsd, voiceCallCount, voiceMinutes, outboundSmsCount, smsThreadCount, activeUserCount, costPerVoiceCallUsd: roundUnitCost(totalCostUsd, voiceCallCount), costPerVoiceMinuteUsd: roundUnitCost(totalCostUsd, voiceMinutes), costPerOutboundSmsUsd: roundUnitCost(totalCostUsd, outboundSmsCount), costPerSmsThreadUsd: roundUnitCost(totalCostUsd, smsThreadCount), costPerActiveUserUsd: roundUnitCost(totalCostUsd, activeUserCount), costPerBusinessUsd: totalCostUsd, recomputedAt: new Date(), updatedAt: new Date() };
    const [rollup] = await tx.insert(unitEconomicsRollups).values(rollupValues).onConflictDoUpdate({ target: [unitEconomicsRollups.businessId, unitEconomicsRollups.monthKey], set: rollupValues }).returning({ id: unitEconomicsRollups.id });
    if (!rollup) throw new Error("Unit economics rollup could not be refreshed.");
    return rollup.id;
  });
}

export async function getUnitEconomicsRollup(context: DomainContext, input: { businessId: string; monthKey?: string }) {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const targetMonth = input.monthKey ?? monthKey(new Date());
    return (await tx.select().from(unitEconomicsRollups).where(and(eq(unitEconomicsRollups.businessId, input.businessId), eq(unitEconomicsRollups.monthKey, targetMonth))).limit(1))[0] ?? null;
  });
}
