import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";
import { PAGE_INTRO_IDS } from "@lobbystack/shared";

import { PAGE_INTROS } from "./pages";

const helpCenter = fileURLToPath(new URL("../../../../../mintlify", import.meta.url));

it.each(PAGE_INTRO_IDS)("links %s to a Help Center page in English, French and Spanish", (page) => {
  const { guide } = PAGE_INTROS[page];
  for (const language of ["", "/fr", "/es"]) {
    expect(existsSync(`${helpCenter}${language}${guide}.mdx`), `mintlify${language}${guide}.mdx`).toBe(true);
  }
});
