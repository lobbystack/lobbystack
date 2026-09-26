import { describe, expect, it } from "vitest";

import { agentModelId, createAgentModel } from "./model";

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

  it("needs a key to reach OpenAI", () => {
    expect(createAgentModel({})).toBeUndefined();
  });
});
