import { describe, expect, it } from "vitest";

import { chunkKnowledgeText } from "./knowledge";

describe("chunkKnowledgeText", () => {
  it("keeps short sources intact", () => {
    expect(chunkKnowledgeText("Parking is behind the building.")).toEqual([
      "Parking is behind the building.",
    ]);
  });

  it("prefers paragraph boundaries and adds overlap", () => {
    const result = chunkKnowledgeText(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
      {
        maxCharacters: 32,
        overlapCharacters: 5,
      },
    );

    expect(result.length).toBeGreaterThan(1);
    expect(result[1]).toContain("paragraph.");
  });

  it("normalizes whitespace without producing empty chunks", () => {
    expect(chunkKnowledgeText("  A\r\n\r\n  B  ")).toEqual(["A\n\n  B"]);
  });
});
