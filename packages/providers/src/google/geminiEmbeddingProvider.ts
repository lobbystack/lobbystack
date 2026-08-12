import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";

import { calculateTokenCost, type AiProviderUsage } from "./aiUsage";

export type GeminiEmbeddingConfig = {
  apiKey: string;
  model?: string;
  dimensions?: number;
  inputCostPerMillionTokens?: number;
};

export class GeminiEmbeddingProvider {
  private readonly model: string;
  private readonly dimensions: number;
  private readonly google: ReturnType<typeof createGoogleGenerativeAI>;
  private readonly inputCostPerMillionTokens: number;

  constructor(config: GeminiEmbeddingConfig) {
    this.model = config.model ?? "gemini-embedding-001";
    this.dimensions = config.dimensions ?? 1536;
    this.google = createGoogleGenerativeAI({ apiKey: config.apiKey });
    this.inputCostPerMillionTokens = config.inputCostPerMillionTokens ?? 0.15;
  }

  async embed(values: string[], onUsage?: (usage: AiProviderUsage) => Promise<void> | void): Promise<number[][]> {
    const startedAt = performance.now();
    const result = await embedMany({
      model: this.google.embedding(this.model),
      values,
      providerOptions: { google: { outputDimensionality: this.dimensions } },
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.gemini.embed",
      },
    });
    const latencyMs = performance.now() - startedAt;
    const totalCostUsd = calculateTokenCost({
      inputTokens: result.usage.tokens,
      inputCostPerMillionTokens: this.inputCostPerMillionTokens,
      outputCostPerMillionTokens: 0,
    });
    await onUsage?.({
      provider: "google",
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
