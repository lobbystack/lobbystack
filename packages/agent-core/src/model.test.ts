import { describe, expect, it } from "vitest";

import { agentModelId, createAgentModel, describeAgentUsage, liveDelegationEnvironment } from "./model";

describe("createAgentModel", () => {
  it("defaults to gpt-6-luna on OpenAI's Responses API", () => {
    const model = createAgentModel({ OPENAI_API_KEY: "sk-test" });
    expect(agentModelId({}).model).toBe("gpt-6-luna");
    expect(model).toMatchObject({ provider: "openai.responses", modelId: "gpt-6-luna" });
  });

  it("uses chat completions for other OpenAI-compatible endpoints", () => {
    const model = createAgentModel({ AI_CHAT_BASE_URL: "http://127.0.0.1:18090/v1", AI_CHAT_MODEL: "local-model" });
    expect(model).toMatchObject({ provider: "openai.chat", modelId: "local-model" });
  });

  it("treats OpenAI's URL with trailing slashes as OpenAI", () => {
    expect(createAgentModel({ OPENAI_API_KEY: "sk-test", AI_CHAT_BASE_URL: "https://api.openai.com/v1//" })).toMatchObject({ provider: "openai.responses" });
  });

  it("needs a key to reach OpenAI", () => {
    expect(createAgentModel({})).toBeUndefined();
  });
});

describe("liveDelegationEnvironment", () => {
  it("runs live delegation on the chat model with low reasoning by default", () => {
    const environment = liveDelegationEnvironment({ OPENAI_API_KEY: "sk-test", AI_CHAT_REASONING_EFFORT: "high", AI_CHAT_INPUT_COST_PER_MILLION_TOKENS: "1", AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS: "2" });
    expect(environment).toMatchObject({ AI_CHAT_MODEL: "gpt-6-luna", AI_CHAT_REASONING_EFFORT: "low", AI_CHAT_INPUT_COST_PER_MILLION_TOKENS: "1" });
    expect(createAgentModel(environment)).toMatchObject({ provider: "openai.responses", modelId: "gpt-6-luna" });
  });

  it("takes its own model and reasoning effort, and drops the chat model's prices for another model", () => {
    const environment = liveDelegationEnvironment({ AI_CHAT_MODEL: "gpt-6-luna", AI_DELEGATION_MODEL: "gpt-6-mini", AI_DELEGATION_REASONING_EFFORT: "medium", AI_CHAT_INPUT_COST_PER_MILLION_TOKENS: "1", AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS: "2" });
    expect(environment).toMatchObject({ AI_CHAT_MODEL: "gpt-6-mini", AI_CHAT_REASONING_EFFORT: "medium" });
    expect(environment.AI_CHAT_INPUT_COST_PER_MILLION_TOKENS).toBeUndefined();
    expect(environment.AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS).toBeUndefined();
  });

  it("ignores an unknown reasoning effort", () => {
    expect(liveDelegationEnvironment({ AI_DELEGATION_REASONING_EFFORT: "fast" }).AI_CHAT_REASONING_EFFORT).toBe("low");
  });
});

describe("describeAgentUsage", () => {
  const priced = {
    AI_CHAT_INPUT_COST_PER_MILLION_TOKENS: "0.1",
    AI_CHAT_CACHED_INPUT_COST_PER_MILLION_TOKENS: "0.01",
    AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS: "0.5",
    AI_CHAT_PRICING_VERSION: "gpt-6-luna-2026-10",
    AI_CHAT_PRICING_SOURCE: "https://developers.openai.com/api/docs/models/gpt-6-luna",
    AI_CHAT_PRICING_EFFECTIVE_DATE: "2026-10-03",
  };
  const usage = { inputTokens: 2_800, outputTokens: 180, totalTokens: 2_980, inputTokenDetails: { cacheReadTokens: 2_600, noCacheTokens: 200, cacheWriteTokens: undefined }, outputTokenDetails: { reasoningTokens: 100, textTokens: 80 } };

  it("charges cached input at its own rate", () => {
    const described = describeAgentUsage(usage, 900, priced);
    // 200 uncached at $0.10, 2,600 cached at $0.01 and 180 output at $0.50 per million.
    expect(described.totalCostUsd).toBeCloseTo((200 * 0.1 + 2_600 * 0.01 + 180 * 0.5) / 1_000_000, 12);
    expect(described.ratesUsdPerMillionTokens).toEqual({ input: 0.1, cachedInput: 0.01, output: 0.5 });
  });

  it("charges cached input at the input rate when no cached rate is set", () => {
    const { AI_CHAT_CACHED_INPUT_COST_PER_MILLION_TOKENS: _cached, ...withoutCached } = priced;
    expect(describeAgentUsage(usage, 900, withoutCached).totalCostUsd).toBeCloseTo((2_800 * 0.1 + 180 * 0.5) / 1_000_000, 12);
  });

  it("leaves the cost unknown without all three pricing metadata fields", () => {
    const { AI_CHAT_PRICING_VERSION: _version, ...unversioned } = priced;
    expect(describeAgentUsage(usage, 900, unversioned)).not.toHaveProperty("totalCostUsd");
  });
});
