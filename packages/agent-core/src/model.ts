import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiUsage } from "@lobbystack/shared";
import { defaultSettingsMiddleware, generateText, Output, wrapLanguageModel, type LanguageModel, type LanguageModelUsage } from "ai";
import type { z } from "zod";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-6-luna";
const DEFAULT_REASONING_EFFORT = "high";
const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
const SERVICE_TIERS = ["auto", "default", "flex", "priority"] as const;
type ServiceTier = (typeof SERVICE_TIERS)[number];
// OpenAI bills priority processing (Fast mode) at twice the standard rates.
const PRIORITY_PRICE_MULTIPLIER = 2;

function serviceTier(environment: AgentModelEnvironment): ServiceTier | undefined {
  const value = environment.AI_CHAT_SERVICE_TIER?.trim();
  return (SERVICE_TIERS as readonly string[]).includes(value ?? "") ? value as ServiceTier : undefined;
}

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

function price(value: string | undefined): number | undefined {
  const parsed = value?.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

// Token usage in the shape AI generation events record. Costs use the AI_CHAT_*
// rates only when they are versioned; otherwise the cost stays unknown rather
// than wrong.
function costUsd(usage: AiUsage, rates: { input: number; cachedInput: number; output: number }): number {
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens ?? 0);
  const uncached = (usage.inputTokens ?? 0) - cached;
  return (uncached * rates.input + cached * rates.cachedInput + (usage.outputTokens ?? 0) * rates.output) / 1_000_000;
}

export function describeAgentUsage(raw: LanguageModelUsage | undefined, latencyMs: number, environment: AgentModelEnvironment = process.env): AiUsage {
  const { provider, model } = agentModelId(environment);
  const usage: AiUsage = {
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
  // Cached input is often a tenth of the input price. Without its own rate,
  // cached tokens cost the full input price.
  const cachedInput = price(environment.AI_CHAT_CACHED_INPUT_COST_PER_MILLION_TOKENS) ?? input;
  const version = environment.AI_CHAT_PRICING_VERSION?.trim();
  const source = environment.AI_CHAT_PRICING_SOURCE?.trim();
  const effective = environment.AI_CHAT_PRICING_EFFECTIVE_DATE?.trim();
  if (input === undefined || output === undefined || !version || !source || !effective) return usage;
  const multiplier = usesOpenAI(environment) && serviceTier(environment) === "priority" ? PRIORITY_PRICE_MULTIPLIER : 1;
  return {
    ...usage,
    totalCostUsd: costUsd(usage, { input, cachedInput: cachedInput!, output }) * multiplier,
    pricingVersion: version,
    pricingSource: source,
    pricingEffectiveDate: effective,
    ratesUsdPerMillionTokens: { input, cachedInput: cachedInput!, output },
  };
}

function reasoningEffort(environment: AgentModelEnvironment): ReasoningEffort {
  const value = environment.AI_CHAT_REASONING_EFFORT?.trim();
  return (REASONING_EFFORTS as readonly string[]).includes(value ?? "") ? value as ReasoningEffort : DEFAULT_REASONING_EFFORT;
}

const DEFAULT_TASK_REASONING_EFFORT: ReasoningEffort = "low";

// Call summaries and GPT-Live delegation run on the AI_CHAT_* endpoint and key
// with their own model (AI_SUMMARY_MODEL, AI_DELEGATION_MODEL) and reasoning
// effort, which defaults to low. The AI_CHAT_* prices describe the chat model,
// so they only price work that runs on that same model.
function taskEnvironment(
  environment: AgentModelEnvironment,
  prefix: "AI_SUMMARY" | "AI_DELEGATION",
  defaultServiceTier?: ServiceTier,
): AgentModelEnvironment {
  const chatModel = agentModelId(environment).model;
  const model = environment[`${prefix}_MODEL`]?.trim() || chatModel;
  const effort = environment[`${prefix}_REASONING_EFFORT`]?.trim();
  const task: AgentModelEnvironment = {
    ...environment,
    AI_CHAT_MODEL: model,
    AI_CHAT_REASONING_EFFORT: (REASONING_EFFORTS as readonly string[]).includes(effort ?? "") ? effort : DEFAULT_TASK_REASONING_EFFORT,
  };
  if (defaultServiceTier) {
    const tier = environment[`${prefix}_SERVICE_TIER`]?.trim();
    task.AI_CHAT_SERVICE_TIER = (SERVICE_TIERS as readonly string[]).includes(tier ?? "") ? tier : defaultServiceTier;
  }
  if (model !== chatModel) {
    delete task.AI_CHAT_INPUT_COST_PER_MILLION_TOKENS;
    delete task.AI_CHAT_CACHED_INPUT_COST_PER_MILLION_TOKENS;
    delete task.AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS;
  }
  return task;
}

export function callSummaryEnvironment(environment: AgentModelEnvironment = process.env): AgentModelEnvironment {
  return taskEnvironment(environment, "AI_SUMMARY");
}

// The agent behind a GPT-Live call answers while the caller waits in silence,
// and each step on high reasoning costs seconds. Website chat keeps AI_CHAT_*.
// OpenAI's GPT-Live guide suggests priority processing for latency-sensitive
// delegation. A delegation costs a fraction of a cent, so twice that is fine.
export function liveDelegationEnvironment(environment: AgentModelEnvironment = process.env): AgentModelEnvironment {
  return taskEnvironment(environment, "AI_DELEGATION", "priority");
}

/**
 * Runs one structured-output call on the call-summary model (AI_SUMMARY_*)
 * and reports its usage. Business summaries, business hours and call
 * summaries share it.
 */
export async function generateSummaryObject<SCHEMA extends z.ZodType>(input: {
  model: LanguageModel;
  name: string;
  schema: SCHEMA;
  instructions: string;
  prompt: string;
  timeoutMs: number;
  abortSignal?: AbortSignal | undefined;
  environment?: AgentModelEnvironment | undefined;
}): Promise<{ output: z.infer<SCHEMA>; usage: AiUsage }> {
  const startedAt = performance.now();
  const result = await generateText({
    model: input.model,
    instructions: input.instructions,
    prompt: input.prompt,
    output: Output.object({ name: input.name, schema: input.schema }),
    maxRetries: 1,
    timeout: input.timeoutMs,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  const usage = describeAgentUsage(result.totalUsage, performance.now() - startedAt, callSummaryEnvironment(input.environment ?? process.env));
  return { output: result.output as z.infer<SCHEMA>, usage };
}

/** The call-summary model and its id, or undefined when no text model is configured. */
export function createSummaryModel(environment: AgentModelEnvironment = process.env): { model: LanguageModel; modelId: { provider: string; model: string } } | undefined {
  const summary = callSummaryEnvironment(environment);
  const model = createAgentModel(summary);
  return model ? { model, modelId: agentModelId(summary) } : undefined;
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
    const tier = serviceTier(environment);
    const openai: OpenAILanguageModelResponsesOptions = { reasoningEffort: reasoningEffort(environment), store: false, ...(tier ? { serviceTier: tier } : {}) };
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
