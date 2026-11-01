import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { setupPromptIds, setupPrompts } from "../packages/shared/src/setupPrompts";
import { docsLocales, setupPromptSnippet, setupPromptSnippetPath } from "./write-setup-prompts";

describe("pnpm docs:setup-prompts", () => {
  const cards = docsLocales.flatMap((locale) => setupPromptIds.map((id) => [locale, id] as const));

  it.each(cards)("keeps the %s %s card in the Help Center in step with its source", (locale, id) => {
    expect(readFileSync(setupPromptSnippetPath(locale, id), "utf8"), "Run pnpm docs:setup-prompts to write the cards again.").toBe(setupPromptSnippet(locale, id));
  });

  it("puts the same English prompt in every language's card", () => {
    for (const id of setupPromptIds) {
      for (const locale of docsLocales) expect(setupPromptSnippet(locale, id)).toContain(`\n${setupPrompts[id]}\n</Prompt>`);
    }
  });
});
