import { describe, expect, it } from "vitest";

import { countKnowledgeTokens, selectKnowledgeWithinBudget } from "./tokenBudget";

describe("knowledge token budget", () => {
  it("counts words, digit groups, punctuation and line breaks", () => {
    expect(countKnowledgeTokens("")).toBe(0);
    expect(countKnowledgeTokens("Parking is free.")).toBe(5);
    expect(countKnowledgeTokens("1250")).toBe(2);
    expect(countKnowledgeTokens("éé\n")).toBe(2);
  });

  // Real o200k counts, measured with js-tiktoken 1.0.21.
  it.each([
    ["an English passage", "Our clinic is open Monday to Friday from 8 a.m. to 6 p.m. Parking is free behind the building. New patients should arrive 15 minutes early to fill out forms.", 39],
    ["a French passage", "Notre clinique est ouverte du lundi au vendredi de 8 h à 18 h. Le stationnement est gratuit derrière l’édifice.", 28],
    [
      "a JSON passage with UUIDs",
      JSON.stringify({ chunkId: "3f2b8c1e-5a7d-4e2b-9c6f-1d8a0b4e7f21", documentId: "9a1c4e7b-2d3f-4b8a-8e5c-6f0d1a2b3c4d", content: "Parking is free behind the building." }),
      90,
    ],
  ])("does not undercount %s", (_label, text, realTokens) => {
    const estimate = countKnowledgeTokens(text);
    expect(estimate).toBeGreaterThanOrEqual(realTokens);
    expect(estimate).toBeLessThanOrEqual(Math.ceil(realTokens * 1.3));
  });

  it("skips items that would exceed the budget and keeps later ones that fit", () => {
    expect(selectKnowledgeWithinBudget(["word ".repeat(10), "short", "tiny"], 3, value => value)).toEqual(["short"]);
  });
});
