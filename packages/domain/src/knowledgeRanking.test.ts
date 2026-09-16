import { describe, expect, it } from "vitest";
import { fuseKnowledgeRanks, knowledgeLexicalQueries, knowledgeQueryTerms, withinKnowledgeBudget, type KnowledgePassage } from "./knowledgeRanking";
import { countKnowledgeTokens } from "@lobbystack/ai";

const passage = (id: string): KnowledgePassage => ({ chunkId: id, documentId: "document", title: "Management", content: "MNGT 10407", sourceUrl: "https://example.com/courses", sourceRevision: 2, sequence: 0 });

describe("knowledge ranking", () => {
  it("matches dotted and plain acronyms without splitting course identifiers", () => {
    expect(knowledgeQueryTerms("B.A.A. Management MNGT 10407")).toEqual(["baa", "management", "mngt", "10407"]);
    expect(knowledgeLexicalQueries(["baa", "management", "10407"])).toEqual({ any: "(baa | b.a.a) | management | 10407", all: "(baa | b.a.a) & management & 10407" });
  });
  it("promotes evidence found by both searches without duplicating it", () => {
    expect(fuseKnowledgeRanks([[passage("a"), passage("b")], [passage("b"), passage("c")]]).map(p => p.chunkId)).toEqual(["b", "a", "c"]);
  });
  it("does not inflate scores for duplicate candidates within one index", () => {
    expect(fuseKnowledgeRanks([[passage("a"), passage("a")], [passage("b")]])).toHaveLength(2);
  });
  it("caps the number of passages", () => {
    expect(fuseKnowledgeRanks([Array.from({ length: 20 }, (_, i) => passage(String(i)))])).toHaveLength(6);
  });
  it("preserves French terms and exact identifier components", () => {
    expect(knowledgeQueryTerms("Quel est le numéro du cours de stratégie MNGT 10407 ?")).toEqual(["stratégie", "mngt", "10407"]);
  });
  it("budgets whole multilingual passages without cutting identifiers", () => {
    const budget = countKnowledgeTokens("éé\n");
    expect(withinKnowledgeBudget(["éé", "MNGT 10407"], budget, value => value)).toEqual(["éé"]);
    expect(withinKnowledgeBudget(["longer than budget ".repeat(100), "10407"], 5, value => value)).toEqual(["10407"]);
  });
});
