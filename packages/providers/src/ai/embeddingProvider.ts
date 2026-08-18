import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany, type EmbeddingModel } from "ai";

import { calculateTokenCost, type AiProviderUsage } from "./aiUsage";

export const DEFAULT_EMBEDDING_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_EMBEDDING_AI_MODEL = "text-embedding-3-small";

export type EmbeddingAiConfig = {
  apiKey: string;
  model?: string;
  baseURL?: string;
  name?: string;
  dimensions?: number;
  inputCostPerMillionTokens?: number;
};

export class OpenAiCompatibleEmbeddingProvider {
  private readonly model: string;
  private readonly dimensions: number;
  private readonly api: EmbeddingModel;
  private readonly providerName: string;
  private readonly inputCostPerMillionTokens: number;

  constructor(config: EmbeddingAiConfig) {
    this.model = config.model ?? DEFAULT_EMBEDDING_AI_MODEL;
    this.providerName = config.name ?? "openai";
    this.dimensions = config.dimensions ?? 1536;
    const factory = createOpenAICompatible({
      name: this.providerName,
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? DEFAULT_EMBEDDING_AI_BASE_URL,
    });
    this.api = factory.embeddingModel(this.model);
    this.inputCostPerMillionTokens = config.inputCostPerMillionTokens ?? 0.02;
  }

  async embed(values: string[], onUsage?: (usage: AiProviderUsage) => Promise<void> | void): Promise<number[][]> {
    const startedAt = performance.now();
    const result = await embedMany({
      model: this.api,
      values,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.embeddingAi.embed",
      },
    });
    const latencyMs = performance.now() - startedAt;
    const totalCostUsd = calculateTokenCost({
      inputTokens: result.usage.tokens,
      inputCostPerMillionTokens: this.inputCostPerMillionTokens,
      outputCostPerMillionTokens: 0,
    });
    await onUsage?.({
      provider: this.providerName,
      model: this.model,
      latencyMs,
      inputTokens: result.usage.tokens,
      totalTokens: result.usage.tokens,
      ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
    });
    return result.embeddings.map((embedding) => normalizeEmbedding(embedding.slice(0, this.dimensions), this.dimensions));
  }
}

export function normalizeEmbedding(values: number[], dimensions = 1536): number[] {
  const result = values.length === dimensions ? values : [...values, ...new Array(dimensions - values.length).fill(0)].slice(0, dimensions);
  const norm = Math.sqrt(result.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? result : result.map((value) => value / norm);
}
