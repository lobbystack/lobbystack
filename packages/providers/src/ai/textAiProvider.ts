import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText, type FinishReason, type LanguageModel, type LanguageModelUsage } from "ai";

import { calculateTokenCost, type AiProviderUsage } from "./aiUsage";

export const DEFAULT_TEXT_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_TEXT_AI_MODEL = "gpt-4o-mini";
export const DEFAULT_TEXT_AI_TIMEOUT_MS = 30_000;
export const DEFAULT_TEXT_AI_CHUNK_TIMEOUT_MS = 10_000;

export type TextAiConfig = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  name?: string;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
  pricingVersion?: string;
  pricingSource?: string;
  pricingEffectiveDate?: string;
  timeoutMs?: number;
  chunkTimeoutMs?: number;
};

export type TextAiStreamResult = {
  textStream: AsyncIterable<string>;
  usage: PromiseLike<AiProviderUsage>;
  finishReason: PromiseLike<FinishReason>;
  [Symbol.asyncIterator](): AsyncIterator<string>;
};

export class OpenAiCompatibleTextProvider {
  private readonly model: string;
  private readonly api: LanguageModel;
  private readonly providerName: string;
  private readonly inputCostPerMillionTokens: number | undefined;
  private readonly outputCostPerMillionTokens: number | undefined;
  private readonly pricingVersion: string | undefined;
  private readonly pricingSource: string | undefined;
  private readonly pricingEffectiveDate: string | undefined;
  private readonly timeoutMs: number;
  private readonly chunkTimeoutMs: number;

  constructor(config: TextAiConfig) {
    this.model = config.model ?? DEFAULT_TEXT_AI_MODEL;
    this.providerName = config.name ?? "openai";
    const factory = createOpenAICompatible({
      name: this.providerName,
      baseURL: config.baseURL ?? DEFAULT_TEXT_AI_BASE_URL,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
    this.api = factory.chatModel(this.model);
    // A rate without its version, source, and effective date cannot be
    // audited later. Keep the monetary value unknown in that case.
    const versionedPricing = hasVersionedPricing(config);
    this.inputCostPerMillionTokens = versionedPricing ? config.inputCostPerMillionTokens : undefined;
    this.outputCostPerMillionTokens = versionedPricing ? config.outputCostPerMillionTokens : undefined;
    this.pricingVersion = config.pricingVersion;
    this.pricingSource = config.pricingSource;
    this.pricingEffectiveDate = config.pricingEffectiveDate;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TEXT_AI_TIMEOUT_MS;
    this.chunkTimeoutMs = config.chunkTimeoutMs ?? DEFAULT_TEXT_AI_CHUNK_TIMEOUT_MS;
  }

  async generateReply(input: { instructions: string; prompt: string; context?: string }): Promise<{ text: string; usage: AiProviderUsage }> {
    const prompt = input.context ? `${input.context}\n\nUser message:\n${input.prompt}` : input.prompt;
    return await this.generate({ instructions: input.instructions, prompt });
  }

  async summarize(input: { instructions: string; transcript: string }): Promise<{ text: string; usage: AiProviderUsage }> {
    return await this.generate({ instructions: input.instructions, prompt: input.transcript });
  }

  private async generate(input: { instructions: string; prompt: string }): Promise<{ text: string; usage: AiProviderUsage }> {
    const startedAt = performance.now();
    const result = await generateText({
      model: this.api,
      system: input.instructions,
      prompt: input.prompt,
      temperature: 0.2,
      maxOutputTokens: 512,
      timeout: this.timeoutMs,
      telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.textAi.generate",
      },
    });
    const text = result.text.trim();
    if (!text) throw new Error("The AI provider returned an empty response.");
    const usage: AiProviderUsage = {
      provider: this.providerName,
      model: this.model,
      latencyMs: performance.now() - startedAt,
      ...(result.usage?.inputTokens !== undefined ? { inputTokens: result.usage.inputTokens } : {}),
      ...(result.usage?.outputTokens !== undefined ? { outputTokens: result.usage.outputTokens } : {}),
      ...(result.usage?.totalTokens !== undefined ? { totalTokens: result.usage.totalTokens } : {}),
    };
    const totalCostUsd = calculateTokenCost({
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      inputCostPerMillionTokens: this.inputCostPerMillionTokens,
      outputCostPerMillionTokens: this.outputCostPerMillionTokens,
    });
    return { text, usage: this.withPricing(usage, totalCostUsd) };
  }

  streamReply(input: {
    instructions: string;
    prompt: string;
    context?: string;
    abortSignal?: AbortSignal;
    onError?: (error: unknown) => void;
    onAbort?: () => void;
  }): TextAiStreamResult {
    const startedAt = performance.now();
    const prompt = input.context ? `${input.context}\n\nUser message:\n${input.prompt}` : input.prompt;
    const stream = streamText({
      model: this.api,
      system: input.instructions,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 512,
      timeout: { totalMs: this.timeoutMs, chunkMs: this.chunkTimeoutMs },
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      ...(input.onError ? { onError: ({ error }: { error: unknown }) => input.onError?.(error) } : {}),
      ...(input.onAbort ? { onAbort: () => input.onAbort?.() } : {}),
      telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.textAi.stream",
      },
    });
    // Keep metadata lazy: accessing stream.usage eagerly would consume the
    // provider stream before the caller has forwarded its deltas.
    let usage: PromiseLike<AiProviderUsage> | undefined;
    let finishReason: PromiseLike<FinishReason> | undefined;
    const provider = this;
    return {
      textStream: stream.textStream,
      get usage() {
        return usage ??= Promise.resolve(stream.usage).then((raw) => provider.toUsage(raw, performance.now() - startedAt));
      },
      get finishReason() {
        return finishReason ??= Promise.resolve(stream.finishReason);
      },
      [Symbol.asyncIterator]() {
        return this.textStream[Symbol.asyncIterator]();
      },
    };
  }

  private toUsage(raw: LanguageModelUsage | undefined, latencyMs: number): AiProviderUsage {
    const inputTokens = raw?.inputTokens;
    const outputTokens = raw?.outputTokens;
    const totalTokens = raw?.totalTokens;
    const cachedInputTokens = raw?.inputTokenDetails?.cacheReadTokens;
    const reasoningTokens = raw?.outputTokenDetails?.reasoningTokens;
    const usage: AiProviderUsage = {
      provider: this.providerName,
      model: this.model,
      latencyMs,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      ...(totalTokens !== undefined ? { totalTokens } : {}),
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    };
    const totalCostUsd = calculateTokenCost({
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      inputCostPerMillionTokens: this.inputCostPerMillionTokens,
      outputCostPerMillionTokens: this.outputCostPerMillionTokens,
    });
    return this.withPricing(usage, totalCostUsd);
  }

  private withPricing(usage: AiProviderUsage, totalCostUsd: number | undefined): AiProviderUsage {
    const rates = this.inputCostPerMillionTokens !== undefined || this.outputCostPerMillionTokens !== undefined
      ? { ...(this.inputCostPerMillionTokens !== undefined ? { input: this.inputCostPerMillionTokens } : {}), ...(this.outputCostPerMillionTokens !== undefined ? { output: this.outputCostPerMillionTokens } : {}) }
      : undefined;
    return { ...usage, ...(totalCostUsd !== undefined ? { totalCostUsd } : {}), ...(this.pricingVersion ? { pricingVersion: this.pricingVersion } : {}), ...(this.pricingSource ? { pricingSource: this.pricingSource } : {}), ...(this.pricingEffectiveDate ? { pricingEffectiveDate: this.pricingEffectiveDate } : {}), ...(rates ? { ratesUsdPerMillionTokens: rates } : {}) };
  }
}

function hasVersionedPricing(config: Pick<TextAiConfig, "pricingVersion" | "pricingSource" | "pricingEffectiveDate">): boolean {
  return Boolean(config.pricingVersion?.trim() && config.pricingSource?.trim() && config.pricingEffectiveDate?.trim());
}

export type TextAiEnvironment = Record<string, string | undefined>;

export function createTextAiProvider(environment: TextAiEnvironment = process.env): OpenAiCompatibleTextProvider | undefined {
  const baseURL = environment.AI_CHAT_BASE_URL?.trim() || DEFAULT_TEXT_AI_BASE_URL;
  const apiKey = environment.AI_CHAT_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim();
  if (!apiKey && baseURL.replace(/\/+$/, "") === DEFAULT_TEXT_AI_BASE_URL) return undefined;
  const inputCost = parseOptionalNumber(environment.AI_CHAT_INPUT_COST_PER_MILLION_TOKENS);
  const config: TextAiConfig = {
    ...(apiKey ? { apiKey } : {}),
    ...(environment.AI_CHAT_MODEL ? { model: environment.AI_CHAT_MODEL } : {}),
    ...(environment.AI_CHAT_BASE_URL?.trim() ? { baseURL: environment.AI_CHAT_BASE_URL.trim() } : {}),
    ...(environment.AI_CHAT_PROVIDER_NAME ? { name: environment.AI_CHAT_PROVIDER_NAME } : {}),
  };
  if (inputCost !== undefined) config.inputCostPerMillionTokens = inputCost;
  const outputCost = parseOptionalNumber(environment.AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS);
  if (outputCost !== undefined) config.outputCostPerMillionTokens = outputCost;
  if (environment.AI_CHAT_PRICING_VERSION?.trim()) config.pricingVersion = environment.AI_CHAT_PRICING_VERSION.trim();
  if (environment.AI_CHAT_PRICING_SOURCE?.trim()) config.pricingSource = environment.AI_CHAT_PRICING_SOURCE.trim();
  if (environment.AI_CHAT_PRICING_EFFECTIVE_DATE?.trim()) config.pricingEffectiveDate = environment.AI_CHAT_PRICING_EFFECTIVE_DATE.trim();
  const timeoutMs = parsePositiveNumber(environment.AI_CHAT_TIMEOUT_MS);
  if (timeoutMs !== undefined) config.timeoutMs = timeoutMs;
  const chunkTimeoutMs = parsePositiveNumber(environment.AI_CHAT_CHUNK_TIMEOUT_MS);
  if (chunkTimeoutMs !== undefined) config.chunkTimeoutMs = chunkTimeoutMs;
  return new OpenAiCompatibleTextProvider(config);
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  const parsed = parseOptionalNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
