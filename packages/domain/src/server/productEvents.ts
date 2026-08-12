import { randomUUID } from "node:crypto";

import { and, eq, isNull, inArray } from "drizzle-orm";

import { businesses, productEvents, withBusinessTransaction } from "@lobbystack/db";

import { buildPostHogAiGenerationProperties, redactTelemetryProperties, type TelemetryEventName, type TelemetryProperties } from "@lobbystack/telemetry";
import type { DomainContext } from "./context";

export async function recordProductEvent(
  context: DomainContext,
  input: { name: TelemetryEventName; distinctId: string; businessId?: string; actorType?: "system" | "worker"; properties: TelemetryProperties },
): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: input.actorType ?? "system" }, async (tx) => {
    if (input.businessId) {
      const business = (await tx.select({ telemetryEnabled: businesses.telemetryEnabled }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1))[0];
      if (!business?.telemetryEnabled) return null;
    }
    const [event] = await tx.insert(productEvents).values({ name: input.name, distinctId: input.distinctId, ...(input.businessId ? { businessId: input.businessId } : {}), properties: redactTelemetryProperties(input.properties) }).returning({ id: productEvents.id });
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
  },
): Promise<string | null> {
  return await recordProductEvent(context, {
    name: "$ai_generation",
    distinctId: input.businessId,
    businessId: input.businessId,
    actorType: "worker",
    properties: buildPostHogAiGenerationProperties({
      traceId: input.traceId ?? randomUUID(),
      provider: input.provider,
      model: input.model,
      latencyMs: input.latencyMs,
      isError: false,
      isStreaming: false,
      ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
      ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
      ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
      ...(input.cachedInputTokens !== undefined ? { cachedInputTokens: input.cachedInputTokens } : {}),
      ...(input.reasoningTokens !== undefined ? { reasoningTokens: input.reasoningTokens } : {}),
      ...(input.totalCostUsd !== undefined ? { totalCostUsd: input.totalCostUsd } : {}),
      ...(input.callId !== undefined ? { callId: input.callId } : {}),
      ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
      ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
      properties: { operation: input.operation },
    }),
  });
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
