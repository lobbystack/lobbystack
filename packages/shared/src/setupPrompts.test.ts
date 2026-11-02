import { describe, expect, it } from "vitest";

import { interfaceLocales } from "./locales";
import { setupPromptCopy, setupPromptIds, setupPrompts } from "./setupPrompts";

const outsideInlineCode = (prompt: string) => prompt.replace(/`[^`]*`/g, "");

describe("setup prompts", () => {
  it.each(setupPromptIds)("%s names its docs, the OpenAPI spec, a test business and a plan first", (id) => {
    const prompt = setupPrompts[id];
    expect(prompt).toMatch(/Read these first:/);
    expect(prompt).toContain("`https://docs.lobbystack.com/");
    expect(prompt).toContain("OpenAPI spec");
    expect(prompt).toContain("https://app.lobbystack.com/api/v1/openapi.json");
    expect(prompt).toMatch(/test business/i);
    expect(prompt).toContain("short plan");
    expect(prompt).toMatch(/Wait for my OK\./);
  });

  it.each(setupPromptIds)("%s keeps secrets away from code and chat", (id) => {
    expect(setupPrompts[id]).toMatch(/this chat/);
  });

  // Mintlify parses a prompt as Markdown and copies what it prints back, so
  // anything else here reaches the clipboard changed, or stops the page building.
  it.each(setupPromptIds)("%s survives Mintlify's Markdown round trip", (id) => {
    const prompt = outsideInlineCode(setupPrompts[id]);
    expect(prompt).not.toMatch(/[[\]{}<_]/);
    expect(prompt).not.toMatch(/https?:\/\//);
    expect(prompt).not.toMatch(/^- /m);
    expect(setupPrompts[id]).not.toMatch(/:\n(?:\* |1\. )/);
    expect(setupPrompts[id]).not.toContain("```");
  });

  it("has a card in every interface language, with no double quote to break an MDX attribute", () => {
    for (const locale of interfaceLocales) {
      expect(Object.keys(setupPromptCopy[locale]).sort()).toEqual([...setupPromptIds].sort());
      for (const id of setupPromptIds) expect(`${setupPromptCopy[locale][id].title}${setupPromptCopy[locale][id].description}`).not.toContain('"');
    }
  });
});
