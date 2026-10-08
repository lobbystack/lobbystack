import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { callerIsDone } from "./callerDone";

function model(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
      warnings: [],
    }),
  });
}

describe("callerIsDone", () => {
  it("ends the call only on a done answer", async () => {
    await expect(callerIsDone(model("done"), "Caller: Bye!")).resolves.toBe(true);
    await expect(callerIsDone(model(" Done.\n"), "Caller: Bye!")).resolves.toBe(true);
    await expect(callerIsDone(model("continue"), "Caller: Oh wait, one more thing.")).resolves.toBe(false);
    await expect(callerIsDone(model("I think they're done"), "Caller: Bye!")).resolves.toBe(false);
  });

  it("sends the conversation with the instructions", async () => {
    const mock = model("done");
    await callerIsDone(mock, "Receptionist: Goodbye!\nCaller: Bye!");
    const prompt = JSON.stringify(mock.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain("Judge the caller's latest words");
    expect(prompt).toContain("Receptionist: Goodbye!\\nCaller: Bye!");
  });
});
