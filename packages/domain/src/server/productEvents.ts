import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { businesses, productEvents, withBusinessTransaction } from "@lobbystack/db";

import { buildPostHogAiGenerationProperties, getPostHogBusinessGroupKey, getPostHogDistinctIdForBusinessSystem, redactTelemetryProperties, validateTelemetryEvent, type DeploymentMode, type TelemetryEventName, type TelemetryProperties } from "@lobbystack/telemetry";
import { getMeter } from "@lobbystack/telemetry/node";
import type { DomainContext } from "./context";
import { recordUnitEconomicsEvent } from "./unitEconomics";

const validationFailures = getMeter("lobbystack-domain").createCounter("telemetry.validation_failed", { unit: "{failure}" });

export async function recordProductEvent(
  context: DomainContext,
  input: { name: TelemetryEventName; distinctId: string; businessId?: string; actorType?: "system" | "worker"; deploymentMode?: DeploymentMode; properties: TelemetryProperties },
): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: input.actorType ?? "system" }, async (tx) => {
    let deploymentMode = input.deploymentMode ?? "development";
    if (input.businessId) {
      const business = (await tx.select({ telemetryEnabled: businesses.telemetryEnabled, deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
      if (!business?.telemetryEnabled) return null;
      deploymentMode = business.deploymentMode as DeploymentMode;
    }
    const properties = redactTelemetryProperties({
      ...input.properties,
      deploymentMode,
      ...(input.businessId ? {
        businessId: input.businessId,
        $groups: { business: getPostHogBusinessGroupKey(input.businessId) },
      } : {}),
    });
    const validation = validateTelemetryEvent({
      name: input.name,
      deploymentMode,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      properties,
    });
    if (!validation.ok) {
      validationFailures.add(1, { event: input.name, deployment_mode: deploymentMode });
      const details = { event: input.name, missing: validation.missing, deploymentMode };
      if (deploymentMode !== "cloud") {
        throw new Error(`Invalid telemetry event ${input.name}: missing ${validation.missing.join(", ")}`);
      }
      console.error("telemetry.validation_failed", details);
    }
    const [event] = await tx.insert(productEvents).values({ name: input.name, distinctId: input.distinctId, ...(input.businessId ? { businessId: input.businessId } : {}), properties }).returning({ id: productEvents.id });
    if (!event) {
      throw new Error("Product event could not be recorded.");
    }
    return event.id;
  });
}

export type DurableAiUsage = {
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalCostUsd?: number;
  pricingVersion?: string;
  pricingSource?: string;
  pricingEffectiveDate?: string;
  pricingRates?: Record<string, number>;
  ratesUsdPerMillionTokens?: Record<string, number>;
  tokenUsage?: Record<string, number>;
  isStreaming?: boolean;
};

export async function recordAiGenerationEvent(
  context: DomainContext,
  input: DurableAiUsage & {
    businessId: string;
    operation: string;
    callId?: string | undefined;
    conversationId?: string | undefined;
    messageId?: string | undefined;
    traceId?: string | undefined;
    sessionId?: string | undefined;
    /** Stable provider generation/item ID for durable idempotency. */
    financialEventKey?: string | undefined;
    isError?: boolean | undefined;
    error?: string | undefined;
  },
): Promise<string | null> {
  const traceId = input.traceId ?? randomUUID();
  // A generation is analyzed in the context of a customer conversation or call.
  // Background generations have no such durable session, so use their trace rather
  // than leaving the AI session field empty.
  const sessionId = input.sessionId ?? input.conversationId ?? input.callId ?? traceId;
  const eventId = await recordProductEvent(context, {
    name: "$ai_generation",
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    businessId: input.businessId,
    actorType: "worker",
    properties: buildPostHogAiGenerationProperties({
      traceId,
      sessionId,
      provider: input.provider,
      model: input.model,
      latencyMs: input.latencyMs,
      isError: input.isError ?? false,
      ...(input.error !== undefined ? { error: input.error } : {}),
      isStreaming: input.isStreaming ?? false,
      ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
      ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
      ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
      ...(input.cachedInputTokens !== undefined ? { cachedInputTokens: input.cachedInputTokens } : {}),
      ...(input.reasoningTokens !== undefined ? { reasoningTokens: input.reasoningTokens } : {}),
      ...(input.totalCostUsd !== undefined ? { totalCostUsd: input.totalCostUsd } : {}),
      ...(input.callId !== undefined ? { callId: input.callId } : {}),
      ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
      ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
      properties: {
        operation: input.operation,
        $groups: { business: getPostHogBusinessGroupKey(input.businessId) },
      },
    }),
  });
  // Finance records are durable operational data and do not depend on the
  // business's optional product-analytics consent. Unknown cost stays null.
  if (!input.operation.startsWith("sms.")) {
    const channel = input.operation.startsWith("sms.") ? "sms" : input.operation.startsWith("voice.") ? "voice" : "dashboard";
    await recordUnitEconomicsEvent(context, {
      businessId: input.businessId,
      eventKey: input.financialEventKey ?? `ai_generation:${traceId}`,
      eventKind: `${channel}_ai`,
      channel,
      costUsd: input.totalCostUsd,
      quantity: 1,
      quantityUnit: "generation",
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      ...(input.pricingVersion !== undefined ? { pricingVersion: input.pricingVersion } : {}),
      ...(input.pricingSource !== undefined ? { pricingSource: input.pricingSource } : {}),
      ...(input.pricingEffectiveDate !== undefined ? { pricingEffectiveDate: input.pricingEffectiveDate } : {}),
      ...(input.pricingRates !== undefined ? { pricingRates: input.pricingRates } : input.ratesUsdPerMillionTokens !== undefined ? { pricingRates: input.ratesUsdPerMillionTokens } : {}),
      ...(input.tokenUsage !== undefined ? { tokenUsage: input.tokenUsage } : {
        tokenUsage: {
          ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
          ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
          ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
          ...(input.cachedInputTokens !== undefined ? { cachedInputTokens: input.cachedInputTokens } : {}),
          ...(input.reasoningTokens !== undefined ? { reasoningTokens: input.reasoningTokens } : {}),
        },
      }),
      ...(input.callId !== undefined ? { callId: input.callId } : {}),
      ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
      ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    });
  }
  return eventId;
}

export async function loadPendingProductEvents(
  context: DomainContext,
  input: { businessId: string; limit?: number },
): Promise<Array<{ id: string; name: string; distinctId: string; businessId: string | null; properties: Record<string, unknown>; occurredAt: Date }>> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) =>
    await tx.select({ id: productEvents.id, name: productEvents.name, distinctId: productEvents.distinctId, businessId: productEvents.businessId, properties: productEvents.properties, occurredAt: productEvents.occurredAt })
      .from(productEvents)
      .where(and(eq(productEvents.businessId, input.businessId), isNull(productEvents.sentAt)))
      .limit(input.limit ?? 100),
  );
}

export async function markProductEventsSent(
  context: DomainContext,
  input: { businessId: string; eventIds: string[] },
): Promise<number> {
  if (input.eventIds.length === 0) return 0;
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.update(productEvents)
      .set({ sentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(productEvents.businessId, input.businessId), inArray(productEvents.id, input.eventIds), isNull(productEvents.sentAt)))
      .returning({ id: productEvents.id });
    return rows.length;
  });
}

export async function deleteSentProductEventsBefore(
  context: DomainContext,
  input: { businessId: string; before: Date; limit?: number },
): Promise<number> {
  const limit = Math.min(5_000, Math.max(1, Math.trunc(input.limit ?? 1_000)));
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const result = await tx.execute<{ id: string }>(sql`
      with candidates as (
        select ${productEvents.id}
        from ${productEvents}
        where ${productEvents.businessId} = ${input.businessId}
          and ${productEvents.sentAt} is not null
          and ${productEvents.sentAt} < ${input.before}
        order by ${productEvents.sentAt}, ${productEvents.id}
        for update skip locked
        limit ${limit}
      )
      delete from ${productEvents}
      using candidates
      where ${productEvents.id} = candidates.id
        and ${productEvents.businessId} = ${input.businessId}
      returning ${productEvents.id}
    `);
    return result.rows.length;
  });
}
