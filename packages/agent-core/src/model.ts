import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel, type LanguageModelUsage } from "ai";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-6-luna";
const DEFAULT_REASONING_EFFORT = "high";
const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

type AgentModelEnvironment = Record<string, string | undefined>;

function usesOpenAI(environment: AgentModelEnvironment): boolean {
  return (environment.AI_CHAT_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "") === DEFAULT_BASE_URL;
}

// Website chat and calls share one text model, set with the AI_CHAT_* variables.
export function agentModelId(environment: AgentModelEnvironment = process.env): { provider: string; model: string } {
  return {
    provider: environment.AI_CHAT_PROVIDER_NAME?.trim() || "openai",
    model: environment.AI_CHAT_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export type AgentUsage = {
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

function price(value: string | undefined): number | undefined {
  const parsed = value?.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

// Token usage in the shape AI generation events record. Costs use the AI_CHAT_*
// rates only when they are versioned; otherwise the cost stays unknown rather
// than wrong.
export function describeAgentUsage(raw: LanguageModelUsage | undefined, latencyMs: number, environment: AgentModelEnvironment = process.env): AgentUsage {
  const { provider, model } = agentModelId(environment);
  const usage: AgentUsage = {
    provider,
    model,
    latencyMs,
    ...(raw?.inputTokens !== undefined ? { inputTokens: raw.inputTokens } : {}),
    ...(raw?.outputTokens !== undefined ? { outputTokens: raw.outputTokens } : {}),
    ...(raw?.totalTokens !== undefined ? { totalTokens: raw.totalTokens } : {}),
    ...(raw?.inputTokenDetails?.cacheReadTokens !== undefined ? { cachedInputTokens: raw.inputTokenDetails.cacheReadTokens } : {}),
    ...(raw?.outputTokenDetails?.reasoningTokens !== undefined ? { reasoningTokens: raw.outputTokenDetails.reasoningTokens } : {}),
  };
  const input = price(environment.AI_CHAT_INPUT_COST_PER_MILLION_TOKENS);
  const output = price(environment.AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS);
  const version = environment.AI_CHAT_PRICING_VERSION?.trim();
  const source = environment.AI_CHAT_PRICING_SOURCE?.trim();
  const effective = environment.AI_CHAT_PRICING_EFFECTIVE_DATE?.trim();
  if (input === undefined || output === undefined || !version || !source || !effective) return usage;
  return {
    ...usage,
    totalCostUsd: ((usage.inputTokens ?? 0) * input + (usage.outputTokens ?? 0) * output) / 1_000_000,
    pricingVersion: version,
    pricingSource: source,
    pricingEffectiveDate: effective,
    ratesUsdPerMillionTokens: { input, output },
  };
}

function reasoningEffort(environment: AgentModelEnvironment): ReasoningEffort {
  const value = environment.AI_CHAT_REASONING_EFFORT?.trim();
  return (REASONING_EFFORTS as readonly string[]).includes(value ?? "") ? value as ReasoningEffort : DEFAULT_REASONING_EFFORT;
}

// OpenAI itself gets the Responses API: its reasoning models only accept
// tools with reasoning turned on there. Any other OpenAI-compatible endpoint
// gets chat completions, which is all most of them speak.
export function createAgentModel(environment: AgentModelEnvironment = process.env): LanguageModel | undefined {
  const baseURL = environment.AI_CHAT_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = environment.AI_CHAT_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim();
  if (!apiKey && baseURL === DEFAULT_BASE_URL) return undefined;
  const { provider: name, model } = agentModelId(environment);
  if (usesOpenAI(environment)) {
    const openai: OpenAILanguageModelResponsesOptions = { reasoningEffort: reasoningEffort(environment), store: false };
    return wrapLanguageModel({
      model: createOpenAI({ ...(apiKey ? { apiKey } : {}) }).responses(model),
      middleware: defaultSettingsMiddleware({ settings: { providerOptions: { openai } } }),
    });
  }
  const provider = createOpenAICompatible({ name, baseURL, ...(apiKey ? { apiKey } : {}) });
  return wrapLanguageModel({
    model: provider.chatModel(model),
    middleware: defaultSettingsMiddleware({ settings: { temperature: 0.2 } }),
  });
}
