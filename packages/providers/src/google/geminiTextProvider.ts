import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, streamText } from "ai";

import { calculateTokenCost, type AiProviderUsage } from "./aiUsage";

export type GeminiTextConfig = {
  apiKey: string;
  model?: string;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
};

export class GeminiTextProvider {
  private readonly model: string;
  private readonly google: ReturnType<typeof createGoogleGenerativeAI>;
  private readonly inputCostPerMillionTokens: number;
  private readonly outputCostPerMillionTokens: number;

  constructor(config: GeminiTextConfig) {
    this.model = config.model ?? "gemini-2.0-flash";
    this.google = createGoogleGenerativeAI({ apiKey: config.apiKey });
    this.inputCostPerMillionTokens = config.inputCostPerMillionTokens ?? 0.1;
    this.outputCostPerMillionTokens = config.outputCostPerMillionTokens ?? 0.4;
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
      model: this.google(this.model),
      system: input.instructions,
      prompt: input.prompt,
      temperature: 0.2,
      maxOutputTokens: 512,
      timeout: 30_000,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.gemini.generate",
      },
    });
    const text = result.text.trim();
    if (!text) throw new Error("Gemini returned an empty response.");
    const usage: AiProviderUsage = {
      provider: "google",
      model: this.model,
      latencyMs: performance.now() - startedAt,
      ...(result.usage.inputTokens !== undefined ? { inputTokens: result.usage.inputTokens } : {}),
      ...(result.usage.outputTokens !== undefined ? { outputTokens: result.usage.outputTokens } : {}),
      ...(result.usage.totalTokens !== undefined ? { totalTokens: result.usage.totalTokens } : {}),
      ...(result.usage.inputTokenDetails.cacheReadTokens !== undefined ? { cachedInputTokens: result.usage.inputTokenDetails.cacheReadTokens } : {}),
      ...(result.usage.outputTokenDetails.reasoningTokens !== undefined ? { reasoningTokens: result.usage.outputTokenDetails.reasoningTokens } : {}),
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
      model: this.google(this.model),
      system: input.instructions,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 512,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: "lobbystack.gemini.stream",
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
