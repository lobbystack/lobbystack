export { selectKnowledgeWithinBudget as withinKnowledgeBudget } from "@lobbystack/ai";

export type KnowledgePassage = {
  chunkId: string;
  documentId: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  sourceRevision: number;
  sequence: number;
  supportingChunkIds?: string[];
};

export function fuseKnowledgeRanks(lists: KnowledgePassage[][], limit = 6): KnowledgePassage[] {
  const ranked = new Map<string, { passage: KnowledgePassage; score: number }>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((passage, index) => {
      if (seen.has(passage.chunkId)) return;
      seen.add(passage.chunkId);
      const existing = ranked.get(passage.chunkId);
      ranked.set(passage.chunkId, { passage, score: (existing?.score ?? 0) + 1 / (60 + index + 1) });
    });
  }
  return [...ranked.values()].sort((a, b) => b.score - a.score || a.passage.chunkId.localeCompare(b.passage.chunkId)).slice(0, limit).map(row => row.passage);
}

export function knowledgeQueryTerms(query: string): string[] {
  const stop = new Set("the a an is are what which of for in and to at on do does can you me i le la les un une de du des au aux à quel quelle quels quelles est sont dans pour et ce cette ces mon ma mes votre vos je tu vous nous il elle en sur avec cours numéro number course".split(" "));
  const normalized = query.replace(/\b(?:[A-Za-z]\.){2,}[A-Za-z]?/g, acronym => acronym.replaceAll(".", ""));
  return [...new Set(normalized.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(term => !stop.has(term)).slice(0, 16);
}

export function knowledgeLexicalQueries(terms: string[]): { any: string; all: string } {
  // PostgreSQL retains dots in acronyms. Query both spellings without changing source text or indexes.
  const alternatives = terms.map(term => /^[a-z]{2,6}$/.test(term) ? `(${term} | ${term.split("").join(".")})` : term);
  return { any: alternatives.join(" | "), all: alternatives.join(" & ") };
}
