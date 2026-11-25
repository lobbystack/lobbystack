import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany, wrapEmbeddingModel, type EmbeddingModel } from "ai";
import { createHash } from "node:crypto";

import { trimTrailingSlashes, type AiUsage } from "@lobbystack/shared";

export const DEFAULT_EMBEDDING_AI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_LARGE_EMBEDDING_MODEL = "text-embedding-3-large";
const OPENAI_LARGE_EMBEDDING_PRICING = {
  inputCostPerMillionTokens: 0.13,
  pricingVersion: "text-embedding-3-large-2026-11",
  pricingSource: "https://developers.openai.com/api/docs/models/text-embedding-3-large",
  pricingEffectiveDate: "2026-11-22",
};
export const DEFAULT_EMBEDDING_AI_MODEL = OPENAI_LARGE_EMBEDDING_MODEL;
export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;
export const DEFAULT_EMBEDDING_MAX_PARALLEL_CALLS = 4;
const EMBEDDING_INPUTS_PER_CALL = 128;
// OpenAI rejects a request over 300,000 tokens. text-embedding-3-* use a
// byte-level BPE, so an input never takes more tokens than its UTF-8 bytes,
// and a request within this many bytes always fits. @ai-sdk/openai sets the
// same limit; @ai-sdk/openai-compatible sets none, so embedMany would group
// inputs by count alone.
const EMBEDDING_REQUEST_MAX_BYTES = 300_000;
// EXPERIMENTAL_EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL in @ai-sdk/provider-utils.
const MAX_INPUT_BYTES_PER_CALL = Symbol.for("vercel.ai.embeddingModel.maxInputBytesPerCall");

export type EmbeddingAiConfig = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  name?: string;
  inputCostPerMillionTokens?: number;
  revision?: string;
  pricingVersion?: string;
  pricingSource?: string;
  pricingEffectiveDate?: string;
  timeoutMs?: number;
  maxParallelCalls?: number;
};

export type EmbeddingOptions = {
  abortSignal?: AbortSignal;
};

export class OpenAiCompatibleEmbeddingProvider {
  readonly embeddingFingerprint: string;
  private readonly model: string;
  private readonly api: EmbeddingModel;
  private readonly providerName: string;
  private readonly inputCostPerMillionTokens: number | undefined;
  private readonly pricingVersion: string | undefined;
  private readonly pricingSource: string | undefined;
  private readonly pricingEffectiveDate: string | undefined;
  private readonly maxParallelCalls: number;

  constructor(config: EmbeddingAiConfig) {
    this.model = config.model ?? DEFAULT_EMBEDDING_AI_MODEL;
    this.providerName = config.name ?? "openai";
    const baseURL = (config.baseURL ?? DEFAULT_EMBEDDING_AI_BASE_URL).replace(/\/$/, "");
    const factory = createOpenAICompatible({
      name: this.providerName,
      baseURL,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
    // Do not attach an unauditable price to financial usage records.
    this.inputCostPerMillionTokens = hasVersionedPricing(config) ? config.inputCostPerMillionTokens : undefined;
    this.pricingVersion = config.pricingVersion;
    this.pricingSource = config.pricingSource;
    this.pricingEffectiveDate = config.pricingEffectiveDate;
    const timeoutMs = config.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS;
    this.maxParallelCalls = config.maxParallelCalls ?? DEFAULT_EMBEDDING_MAX_PARALLEL_CALLS;
    if (!Number.isInteger(this.maxParallelCalls) || this.maxParallelCalls < 1) {
      throw new Error("Embedding max parallel calls must be a positive integer.");
    }
    this.api = wrapEmbeddingModel({
      model: Object.assign(factory.embeddingModel(this.model), { [MAX_INPUT_BYTES_PER_CALL]: EMBEDDING_REQUEST_MAX_BYTES }),
      middleware: {
        overrideMaxEmbeddingsPerCall: () => EMBEDDING_INPUTS_PER_CALL,
        // Each request gets its own timeout, so a large document has time for all its requests.
        transformParams: async ({ params }) => ({ ...params, abortSignal: params.abortSignal ? AbortSignal.any([params.abortSignal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) }),
      },
    });
    this.embeddingFingerprint = createEmbeddingFingerprint({
      baseURL,
      model: this.model,
      providerName: this.providerName,
      revision: config.revision ?? "1",
    });
  }

  get fingerprint(): string {
    return this.embeddingFingerprint;
  }

  async embed(values: string[], onUsage?: (usage: AiUsage) => Promise<void> | void, options?: EmbeddingOptions): Promise<number[][]> {
    const startedAt = performance.now();
    const result = await embedMany({
      model: this.api,
      values,
      ...(this.model === OPENAI_LARGE_EMBEDDING_MODEL ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
      maxParallelCalls: this.maxParallelCalls,
      telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.embeddingAi.embed",
      },
    });
    const { tokens } = result.usage;
    if (onUsage && Number.isFinite(tokens)) {
      const inputRate = this.inputCostPerMillionTokens;
      await onUsage({
        provider: this.providerName,
        model: this.model,
        latencyMs: performance.now() - startedAt,
        inputTokens: tokens,
        totalTokens: tokens,
        ...(inputRate !== undefined ? {
          totalCostUsd: (tokens * inputRate) / 1_000_000,
          ratesUsdPerMillionTokens: { input: inputRate },
        } : {}),
        ...(this.pricingVersion ? { pricingVersion: this.pricingVersion } : {}),
        ...(this.pricingSource ? { pricingSource: this.pricingSource } : {}),
        ...(this.pricingEffectiveDate ? { pricingEffectiveDate: this.pricingEffectiveDate } : {}),
      });
    }
    return result.embeddings.map((embedding) => normalizeEmbedding(embedding));
  }
}

function hasVersionedPricing(config: Pick<EmbeddingAiConfig, "pricingVersion" | "pricingSource" | "pricingEffectiveDate">): boolean {
  return Boolean(config.pricingVersion?.trim() && config.pricingSource?.trim() && config.pricingEffectiveDate?.trim());
}

export function normalizeEmbedding(values: number[]): number[] {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding provider returned ${values.length} dimensions; this deployment requires exactly ${EMBEDDING_DIMENSIONS}.`);
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned a non-finite value.");
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) throw new Error("Embedding provider returned a zero vector.");
  return values.map((value) => value / norm);
}

export function createEmbeddingFingerprint(input: { baseURL: string; model: string; providerName: string; revision?: string }): string {
  return createHash("sha256").update(JSON.stringify({
    // The previous re-embedding pipeline could pair vectors with the wrong text.
    pipelineVersion: 2,
    baseURL: input.baseURL.replace(/\/$/, ""),
    model: input.model,
    providerName: input.providerName,
    dimensions: EMBEDDING_DIMENSIONS,
    revision: input.revision ?? "1",
  })).digest("hex");
}

export type EmbeddingAiEnvironment = Record<string, string | undefined>;

export function createEmbeddingProvider(environment: EmbeddingAiEnvironment = process.env): OpenAiCompatibleEmbeddingProvider | undefined {
  const baseURL = environment.AI_EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_AI_BASE_URL;
  const model = environment.AI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_AI_MODEL;
  const name = environment.AI_EMBEDDING_PROVIDER_NAME?.trim() || "openai";
  const apiKey = environment.AI_EMBEDDING_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim();
  const isOpenAiEndpoint = trimTrailingSlashes(baseURL) === DEFAULT_EMBEDDING_AI_BASE_URL;
  if (!apiKey && isOpenAiEndpoint) return undefined;
  // An unbound rate cannot follow a model change.
  const matchesPricingModel = environment.AI_EMBEDDING_PRICING_MODEL?.trim() === model;
  const inputRate = matchesPricingModel ? environment.AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS?.trim() : undefined;
  const inputCostPerMillionTokens = parseOptionalNumber(inputRate);
  const pricingVersion = matchesPricingModel ? environment.AI_EMBEDDING_PRICING_VERSION?.trim() : undefined;
  const pricingSource = matchesPricingModel ? environment.AI_EMBEDDING_PRICING_SOURCE?.trim() : undefined;
  const pricingEffectiveDate = matchesPricingModel ? environment.AI_EMBEDDING_PRICING_EFFECTIVE_DATE?.trim() : undefined;
  const useDefaultPricing = isOpenAiEndpoint && model === OPENAI_LARGE_EMBEDDING_MODEL && name === "openai"
    && !inputRate && !pricingVersion && !pricingSource && !pricingEffectiveDate;
  const timeoutMs = parsePositiveNumber(environment.AI_EMBEDDING_TIMEOUT_MS);
  const maxParallelCalls = parsePositiveNumber(environment.AI_EMBEDDING_MAX_PARALLEL_CALLS);
  return new OpenAiCompatibleEmbeddingProvider({
    ...(apiKey ? { apiKey } : {}),
    model,
    baseURL,
    name,
    ...(environment.AI_EMBEDDING_REVISION ? { revision: environment.AI_EMBEDDING_REVISION } : {}),
    ...(useDefaultPricing ? OPENAI_LARGE_EMBEDDING_PRICING : {
      ...(pricingVersion ? { pricingVersion } : {}),
      ...(pricingSource ? { pricingSource } : {}),
      ...(pricingEffectiveDate ? { pricingEffectiveDate } : {}),
      ...(inputCostPerMillionTokens !== undefined ? { inputCostPerMillionTokens } : {}),
    }),
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
