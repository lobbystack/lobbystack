import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { setupPromptCopy, setupPromptIds, setupPrompts, type SetupPromptId } from "../packages/shared/src/setupPrompts";

// Writes the prompt cards that the Help Center's pages import, from the single
// source in packages/shared/src/setupPrompts.ts. Each language gets its own
// card text around the same English prompt. Mintlify translates the button.
// scripts/write-setup-prompts.test.ts fails when a committed card falls behind.

export const docsLocales = ["en", "fr", "es"] as const;
export type DocsLocale = (typeof docsLocales)[number];

const icons: Record<SetupPromptId, string> = {
  "no-code": "wand-magic-sparkles",
  saas: "code",
  "white-label": "palette",
  partner: "store",
  "self-host": "server",
};

/** The prompt's card for one language, as the MDX snippet the docs pages import. */
export function setupPromptSnippet(locale: DocsLocale, id: SetupPromptId): string {
  const { title, description } = setupPromptCopy[locale][id];
  return [
    "{/* Generated from packages/shared/src/setupPrompts.ts. Run pnpm docs:setup-prompts after changing it. */}",
    "",
    `<Prompt description="**${title}.** ${description}" icon="${icons[id]}">`,
    setupPrompts[id],
    "</Prompt>",
    "",
  ].join("\n");
}

/** Where the snippet for one language lives in the Mintlify project. */
export function setupPromptSnippetPath(locale: DocsLocale, id: SetupPromptId): string {
  const folder = locale === "en" ? "" : `${locale}/`;
  return fileURLToPath(new URL(`../mintlify/snippets/${folder}setup-prompts/${id}.mdx`, import.meta.url));
}

function main(): void {
  for (const locale of docsLocales) {
    for (const id of setupPromptIds) {
      const target = setupPromptSnippetPath(locale, id);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, setupPromptSnippet(locale, id));
      console.log(`Wrote ${target}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
