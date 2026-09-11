import { recordUnitEconomicsEvent, type DomainContext } from "@lobbystack/domain";

export type VoiceAiCostLedgerInput = {
  businessId: string;
  eventKey: string;
  // A model with no approved price must remain financially unknown.  Do not
  // turn that absence into a zero-cost generation.
  costUsd: number | null;
  occurredAt?: string;
  provider: string;
  model: string;
  operation: string;
  pricingVersion?: string;
  pricingSource?: string;
  pricingEffectiveDate?: string;
  pricingRates?: Record<string, number>;
  tokenUsage?: Record<string, number>;
  callId?: string;
  conversationId?: string;
};

export async function recordVoiceAiCostLedger(
  context: DomainContext,
  input: VoiceAiCostLedgerInput,
): Promise<void> {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  await recordUnitEconomicsEvent(context, {
    businessId: input.businessId,
    eventKey: input.eventKey,
    eventKind: "voice_ai",
    channel: "voice",
    costUsd: input.costUsd,
    ...(Number.isNaN(occurredAt.valueOf()) ? {} : { occurredAt }),
    quantity: 1,
    quantityUnit: "generation",
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    ...(input.pricingVersion ? { pricingVersion: input.pricingVersion } : {}),
    ...(input.pricingSource ? { pricingSource: input.pricingSource } : {}),
    ...(input.pricingEffectiveDate ? { pricingEffectiveDate: input.pricingEffectiveDate } : {}),
    ...(input.pricingRates ? { pricingRates: input.pricingRates } : {}),
    ...(input.tokenUsage ? { tokenUsage: input.tokenUsage } : {}),
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });
}
