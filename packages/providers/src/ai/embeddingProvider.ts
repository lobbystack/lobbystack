import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany, type EmbeddingModel } from "ai";
import { createHash } from "node:crypto";

import { calculateTokenCost, type AiProviderUsage } from "./aiUsage";

export const DEFAULT_EMBEDDING_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_EMBEDDING_AI_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;
export const DEFAULT_EMBEDDING_MAX_PARALLEL_CALLS = 4;

export type EmbeddingAiConfig = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  name?: string;
  dimensions?: number;
  inputCostPerMillionTokens?: number;
  revision?: string;
  timeoutMs?: number;
  maxParallelCalls?: number;
};

export type EmbeddingOptions = {
  abortSignal?: AbortSignal;
};

export class OpenAiCompatibleEmbeddingProvider {
  private readonly model: string;
  private readonly dimensions: number;
  private readonly api: EmbeddingModel;
  private readonly providerName: string;
  private readonly inputCostPerMillionTokens: number;
  private readonly embeddingFingerprint: string;
  private readonly timeoutMs: number;
  private readonly maxParallelCalls: number;

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
    this.timeoutMs = config.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS;
    this.maxParallelCalls = config.maxParallelCalls ?? DEFAULT_EMBEDDING_MAX_PARALLEL_CALLS;
    if (!Number.isInteger(this.maxParallelCalls) || this.maxParallelCalls < 1) {
      throw new Error("Embedding max parallel calls must be a positive integer.");
    }
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

  async embed(values: string[], onUsage?: (usage: AiProviderUsage) => Promise<void> | void, options?: EmbeddingOptions): Promise<number[][]> {
    const startedAt = performance.now();
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const abortSignal = options?.abortSignal ? AbortSignal.any([options.abortSignal, timeoutSignal]) : timeoutSignal;
    const result = await embedMany({
      model: this.api,
      values,
      abortSignal,
      maxParallelCalls: this.maxParallelCalls,
      telemetry: {
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
  const baseURL = environment.AI_EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_AI_BASE_URL;
  const apiKey = environment.AI_EMBEDDING_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim();
  if (!apiKey && baseURL.replace(/\/+$/, "") === DEFAULT_EMBEDDING_AI_BASE_URL) return undefined;
  const inputCostPerMillionTokens = parseOptionalNumber(environment.AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS);
  const timeoutMs = parsePositiveNumber(environment.AI_EMBEDDING_TIMEOUT_MS);
  const maxParallelCalls = parsePositiveNumber(environment.AI_EMBEDDING_MAX_PARALLEL_CALLS);
  return new OpenAiCompatibleEmbeddingProvider({
    ...(apiKey ? { apiKey } : {}),
    ...(environment.AI_EMBEDDING_MODEL ? { model: environment.AI_EMBEDDING_MODEL } : {}),
    ...(environment.AI_EMBEDDING_BASE_URL?.trim() ? { baseURL: environment.AI_EMBEDDING_BASE_URL.trim() } : {}),
    ...(environment.AI_EMBEDDING_PROVIDER_NAME ? { name: environment.AI_EMBEDDING_PROVIDER_NAME } : {}),
    ...(environment.AI_EMBEDDING_REVISION ? { revision: environment.AI_EMBEDDING_REVISION } : {}),
    ...(inputCostPerMillionTokens !== undefined ? { inputCostPerMillionTokens } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxParallelCalls !== undefined ? { maxParallelCalls } : {}),
  });
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
