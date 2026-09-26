import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel, LanguageModelUsage } from "ai";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.4-mini";

type AgentModelEnvironment = Record<string, string | undefined>;

// Reads the same AI_CHAT_* variables as website chat, so self-hosters configure one
// text provider. AGENT_CORE_MODEL lets the agent use a faster model than chat.
export function agentModelId(environment: AgentModelEnvironment = process.env): { provider: string; model: string } {
  return {
    provider: environment.AI_CHAT_PROVIDER_NAME?.trim() || "openai",
    model: environment.AGENT_CORE_MODEL?.trim() || environment.AI_CHAT_MODEL?.trim() || DEFAULT_MODEL,
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
// rates only when they are versioned and the agent runs the chat model they
// describe; otherwise the cost stays unknown rather than wrong.
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
  const ratesApply = model === (environment.AI_CHAT_MODEL?.trim() || DEFAULT_MODEL);
  if (!ratesApply || input === undefined || output === undefined || !version || !source || !effective) return usage;
  return {
    ...usage,
    totalCostUsd: ((usage.inputTokens ?? 0) * input + (usage.outputTokens ?? 0) * output) / 1_000_000,
    pricingVersion: version,
    pricingSource: source,
    pricingEffectiveDate: effective,
    ratesUsdPerMillionTokens: { input, output },
  };
}

export function createAgentModel(environment: AgentModelEnvironment = process.env): LanguageModel | undefined {
  const baseURL = environment.AI_CHAT_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = environment.AI_CHAT_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim();
  if (!apiKey && baseURL === DEFAULT_BASE_URL) return undefined;
  const provider = createOpenAICompatible({
    name: environment.AI_CHAT_PROVIDER_NAME?.trim() || "openai",
    baseURL,
    ...(apiKey ? { apiKey } : {}),
  });
  return provider.chatModel(agentModelId(environment).model);
}
