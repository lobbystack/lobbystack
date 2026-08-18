import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText, type LanguageModel } from "ai";

import { calculateTokenCost, type AiProviderUsage } from "./aiUsage";

export const DEFAULT_TEXT_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_TEXT_AI_MODEL = "gpt-4o-mini";

export type TextAiConfig = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  name?: string;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
};

export class OpenAiCompatibleTextProvider {
  private readonly model: string;
  private readonly api: LanguageModel;
  private readonly providerName: string;
  private readonly inputCostPerMillionTokens: number;
  private readonly outputCostPerMillionTokens: number;

  constructor(config: TextAiConfig) {
    this.model = config.model ?? DEFAULT_TEXT_AI_MODEL;
    this.providerName = config.name ?? "openai";
    const factory = createOpenAICompatible({
      name: this.providerName,
      baseURL: config.baseURL ?? DEFAULT_TEXT_AI_BASE_URL,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
    this.api = factory.chatModel(this.model);
    this.inputCostPerMillionTokens = config.inputCostPerMillionTokens ?? 0.15;
    this.outputCostPerMillionTokens = config.outputCostPerMillionTokens ?? 0.6;
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
      timeout: 30_000,
      experimental_telemetry: {
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
    return { text, usage: { ...usage, ...(totalCostUsd !== undefined ? { totalCostUsd } : {}) } };
  }

  streamReply(input: { instructions: string; prompt: string; context?: string }): AsyncIterable<string> {
    const prompt = input.context ? `${input.context}\n\nUser message:\n${input.prompt}` : input.prompt;
    const stream = streamText({
      model: this.api,
      system: input.instructions,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 512,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.textAi.stream",
      },
    });
    return {
      async *[Symbol.asyncIterator]() {
        for await (const delta of stream.textStream) {
          yield delta;
        }
      },
    };
  }
}

export type TextAiEnvironment = Record<string, string | undefined>;

export function createTextAiProvider(environment: TextAiEnvironment = process.env): OpenAiCompatibleTextProvider | undefined {
  const baseURL = environment.AI_CHAT_BASE_URL ?? DEFAULT_TEXT_AI_BASE_URL;
  const apiKey = environment.AI_CHAT_API_KEY ?? environment.OPENAI_API_KEY;
  if (!apiKey && baseURL.replace(/\/+$/, "") === DEFAULT_TEXT_AI_BASE_URL) return undefined;
  const inputCost = parseOptionalNumber(environment.AI_CHAT_INPUT_COST_PER_MILLION_TOKENS);
  const config: TextAiConfig = {
    ...(apiKey ? { apiKey } : {}),
    ...(environment.AI_CHAT_MODEL ? { model: environment.AI_CHAT_MODEL } : {}),
    ...(environment.AI_CHAT_BASE_URL ? { baseURL: environment.AI_CHAT_BASE_URL } : {}),
    ...(environment.AI_CHAT_PROVIDER_NAME ? { name: environment.AI_CHAT_PROVIDER_NAME } : {}),
  };
  if (inputCost !== undefined) config.inputCostPerMillionTokens = inputCost;
  const outputCost = parseOptionalNumber(environment.AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS);
  if (outputCost !== undefined) config.outputCostPerMillionTokens = outputCost;
  return new OpenAiCompatibleTextProvider(config);
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
