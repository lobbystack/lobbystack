export type AiProviderUsage = {
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
  ratesUsdPerMillionTokens?: Record<string, number>;
};

export function calculateTokenCost(input: {
  inputTokens?: number;
  outputTokens?: number;
  inputCostPerMillionTokens: number | undefined;
  outputCostPerMillionTokens: number | undefined;
}): number | undefined {
  if ((input.inputTokens !== undefined && input.inputCostPerMillionTokens === undefined) ||
    (input.outputTokens !== undefined && input.outputCostPerMillionTokens === undefined)) return undefined;
  if (input.inputTokens === undefined && input.outputTokens === undefined) return undefined;
  return ((input.inputTokens ?? 0) * (input.inputCostPerMillionTokens ?? 0) + (input.outputTokens ?? 0) * (input.outputCostPerMillionTokens ?? 0)) / 1_000_000;
}
