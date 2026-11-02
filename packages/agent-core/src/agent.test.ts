import { demoSnapshot } from "@lobbystack/shared";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

const { takeMessageForStaff } = vi.hoisted(() => ({ takeMessageForStaff: vi.fn() }));
vi.mock("@lobbystack/domain", async (importOriginal) => ({ ...await importOriginal<typeof import("@lobbystack/domain")>(), takeMessageForStaff }));

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

/** A model that calls one tool, then does what `next` says. */
function modelCalling(toolName: string, input: Record<string, unknown>, next: () => { content: Array<{ type: "text"; text: string }> }) {
  let step = 0;
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
  return new MockLanguageModelV4({
    doGenerate: async () => {
      step += 1;
      if (step === 1) return { content: [{ type: "tool-call" as const, toolCallId: "call_1", toolName, input: JSON.stringify(input) }], finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [] };
      return { ...next(), finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
    },
  });
}

describe("onAction", () => {
  const context = { domain: { db: {} as never }, snapshot: demoSnapshot, channel: "sms" as const, conversationId: "conversation" };

  it("fires for a tool that changed something, before a later step fails", async () => {
    takeMessageForStaff.mockResolvedValue({ ok: true });
    const onAction = vi.fn();
    const agent = createReceptionistAgent({ model: modelCalling("takeMessage", { message: "Call me back" }, () => { throw new Error("provider down"); }), context, onAction });
    await expect(agent.generate({ prompt: "Have someone call me." })).rejects.toThrow("provider down");
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("fires for an empty last step too", async () => {
    takeMessageForStaff.mockResolvedValue({ ok: true });
    const onAction = vi.fn();
    const agent = createReceptionistAgent({ model: modelCalling("takeMessage", { message: "Call me back" }, () => ({ content: [] })), context, onAction });
    expect((await agent.generate({ prompt: "Have someone call me." })).text).toBe("");
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("stays quiet for a lookup, and for a tool that refused", async () => {
    const onAction = vi.fn();
    const lookup = createReceptionistAgent({ model: modelCalling("getBusinessHours", {}, () => ({ content: [{ type: "text", text: "We open at 9." }] })), context, onAction });
    await lookup.generate({ prompt: "When do you open?" });
    takeMessageForStaff.mockResolvedValue({ ok: false, reason: "Ask for a callback number." });
    const refused = createReceptionistAgent({ model: modelCalling("takeMessage", { message: "Call me" }, () => ({ content: [{ type: "text", text: "What's your number?" }] })), context, onAction });
    await refused.generate({ prompt: "Have someone call me." });
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("createReceptionistAgent", () => {
  it("caps each website chat step's output so a reply can't run long", async () => {
    expect((await firstCall("web_chat")).maxOutputTokens).toBe(WEB_CHAT_MAX_OUTPUT_TOKENS);
  });

  it("leaves calls uncapped", async () => {
    expect((await firstCall("voice")).maxOutputTokens).toBeUndefined();
    expect((await firstCall("web_voice")).maxOutputTokens).toBeUndefined();
  });
});
