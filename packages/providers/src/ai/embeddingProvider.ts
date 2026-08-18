import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany, type EmbeddingModel } from "ai";
import { createHash } from "node:crypto";

import { calculateTokenCost, type AiProviderUsage } from "./aiUsage";

export const DEFAULT_EMBEDDING_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_EMBEDDING_AI_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingAiConfig = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  name?: string;
  dimensions?: number;
  inputCostPerMillionTokens?: number;
  revision?: string;
};

export class OpenAiCompatibleEmbeddingProvider {
  private readonly model: string;
  private readonly dimensions: number;
  private readonly api: EmbeddingModel;
  private readonly providerName: string;
  private readonly inputCostPerMillionTokens: number;
  private readonly embeddingFingerprint: string;

  constructor(config: EmbeddingAiConfig) {
    this.model = config.model ?? DEFAULT_EMBEDDING_AI_MODEL;
    this.providerName = config.name ?? "openai";
    this.dimensions = config.dimensions ?? EMBEDDING_DIMENSIONS;
    if (this.dimensions !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Embedding dimensions must be exactly ${EMBEDDING_DIMENSIONS}; received ${this.dimensions}.`);
    }
    const baseURL = (config.baseURL ?? DEFAULT_EMBEDDING_AI_BASE_URL).replace(/\/$/, "");
    const factory = createOpenAICompatible({
      name: this.providerName,
      baseURL,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
    this.api = factory.embeddingModel(this.model);
    this.inputCostPerMillionTokens = config.inputCostPerMillionTokens ?? 0.02;
    this.embeddingFingerprint = createEmbeddingFingerprint({
      baseURL,
      model: this.model,
      providerName: this.providerName,
      dimensions: this.dimensions,
      revision: config.revision ?? "1",
    });
  }

  get fingerprint(): string {
    return this.embeddingFingerprint;
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
    return result.embeddings.map((embedding) => normalizeEmbedding(embedding, this.dimensions));
  }
}

export function normalizeEmbedding(values: number[], dimensions = 1536): number[] {
  if (values.length !== dimensions) {
    throw new Error(`Embedding provider returned ${values.length} dimensions; this deployment requires exactly ${dimensions}.`);
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned a non-finite value.");
  }
  const result = values;
  const norm = Math.sqrt(result.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) throw new Error("Embedding provider returned a zero vector.");
  return result.map((value) => value / norm);
}

export function createEmbeddingFingerprint(input: { baseURL: string; model: string; providerName: string; dimensions?: number; revision?: string }): string {
  return createHash("sha256").update(JSON.stringify({
    baseURL: input.baseURL.replace(/\/$/, ""),
    model: input.model,
    providerName: input.providerName,
    dimensions: input.dimensions ?? EMBEDDING_DIMENSIONS,
    revision: input.revision ?? "1",
  })).digest("hex");
}

export type EmbeddingAiEnvironment = Record<string, string | undefined>;

export function createEmbeddingProvider(environment: EmbeddingAiEnvironment = process.env): OpenAiCompatibleEmbeddingProvider | undefined {
  const baseURL = environment.AI_EMBEDDING_BASE_URL ?? DEFAULT_EMBEDDING_AI_BASE_URL;
  const apiKey = environment.AI_EMBEDDING_API_KEY ?? environment.OPENAI_API_KEY;
  if (!apiKey && baseURL.replace(/\/+$/, "") === DEFAULT_EMBEDDING_AI_BASE_URL) return undefined;
  const inputCostPerMillionTokens = parseOptionalNumber(environment.AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS);
  return new OpenAiCompatibleEmbeddingProvider({
    ...(apiKey ? { apiKey } : {}),
    ...(environment.AI_EMBEDDING_MODEL ? { model: environment.AI_EMBEDDING_MODEL } : {}),
    ...(environment.AI_EMBEDDING_BASE_URL ? { baseURL: environment.AI_EMBEDDING_BASE_URL } : {}),
    ...(environment.AI_EMBEDDING_PROVIDER_NAME ? { name: environment.AI_EMBEDDING_PROVIDER_NAME } : {}),
    ...(environment.AI_EMBEDDING_REVISION ? { revision: environment.AI_EMBEDDING_REVISION } : {}),
    ...(inputCostPerMillionTokens !== undefined ? { inputCostPerMillionTokens } : {}),
  });
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
