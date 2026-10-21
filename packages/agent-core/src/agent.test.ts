import { demoSnapshot } from "@lobbystack/shared";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { createReceptionistAgent, WEB_CHAT_MAX_OUTPUT_TOKENS } from "./agent";
import type { AgentChannel } from "./tools";

type LanguageModelV4CallOptions = Parameters<MockLanguageModelV4["doGenerate"]>[0];

async function firstCall(channel: AgentChannel): Promise<LanguageModelV4CallOptions> {
  const calls: LanguageModelV4CallOptions[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      calls.push(options);
      return {
        content: [{ type: "text", text: "We're open until 5." }],
        finishReason: { unified: "stop", raw: undefined },
        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 5, text: 5, reasoning: undefined } },
        warnings: [],
      };
    },
  });
  const agent = createReceptionistAgent({ model, context: { domain: { db: {} as never }, snapshot: demoSnapshot, channel } });
  await agent.generate({ prompt: "When do you close?" });
  return calls[0]!;
}

describe("createReceptionistAgent", () => {
  it("caps each website chat step's output so a reply can't run long", async () => {
    expect((await firstCall("web_chat")).maxOutputTokens).toBe(WEB_CHAT_MAX_OUTPUT_TOKENS);
  });

  it("leaves calls uncapped", async () => {
    expect((await firstCall("voice")).maxOutputTokens).toBeUndefined();
    expect((await firstCall("web_voice")).maxOutputTokens).toBeUndefined();
  });
});
