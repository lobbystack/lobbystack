import { describe, expect, it } from "vitest";
import { evaluationSources, voiceKnowledgeCases } from "./voiceKnowledge.v1";

describe("versioned voice knowledge cases", () => {
  it("contains the agreed distribution and unique case identifiers", () => {
    expect(voiceKnowledgeCases).toHaveLength(40);
    expect(new Set(voiceKnowledgeCases.map(row => row.id)).size).toBe(40);
    expect(voiceKnowledgeCases.filter(row => row.category === "answerable")).toHaveLength(20);
    expect(voiceKnowledgeCases.filter(row => row.category === "followup")).toHaveLength(10);
    expect(voiceKnowledgeCases.filter(row => row.category === "unanswerable")).toHaveLength(10);
  });
  it("links answerable questions to supporting sources from the same tenant", () => {
    for (const row of voiceKnowledgeCases.filter(row => row.category !== "unanswerable")) {
      expect(row.expected.length).toBeGreaterThan(0);
      for (const id of row.sourceIds) expect(evaluationSources.find(source => source.id === id)?.tenant).toBe(row.tenant);
    }
  });
  it("includes exact HEC identifiers, multilingual follow-ups and safety cases", () => {
    expect(voiceKnowledgeCases.filter(row => row.expected.includes("MNGT 10407"))).toHaveLength(2);
    expect(voiceKnowledgeCases.some(row => row.expectedBehavior === "ignore_document_instructions")).toBe(true);
    expect(new Set(voiceKnowledgeCases.map(row => row.language))).toEqual(new Set(["fr", "en"]));
  });
});
