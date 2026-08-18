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
};

export function calculateTokenCost(input: {
  inputTokens?: number;
  outputTokens?: number;
  inputCostPerMillionTokens: number;
  outputCostPerMillionTokens: number;
}): number | undefined {
  if (input.inputTokens === undefined && input.outputTokens === undefined) return undefined;
  return ((input.inputTokens ?? 0) * input.inputCostPerMillionTokens + (input.outputTokens ?? 0) * input.outputCostPerMillionTokens) / 1_000_000;
}
