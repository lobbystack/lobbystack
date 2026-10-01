export { countKnowledgeTokens, selectKnowledgeWithinBudget as withinKnowledgeBudget } from "@lobbystack/ai";

/** Tokens one knowledge lookup may hand the agent, evidence and snippets together. */
export const KNOWLEDGE_SEARCH_TOKEN_BUDGET = 3000;

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

// Stop words cover English, French, Spanish and Serbian (Latin script) function words, plus elided French articles like the "l" in "l'heure".
export function knowledgeQueryTerms(query: string): string[] {
  const stop = new Set("the a an is are what which of for in and to at on do does can you me i le la les un une de du des au aux à quel quelle quels quelles est sont dans pour et ce cette ces mon ma mes votre vos je tu vous nous il elle en sur avec cours numéro number course how much many your my we our it or with have has there any this that be from by when where who why please qui que qu quoi où ou comment quand combien y ont avez l d j s n c m t se sa nos notre leur leurs el los las del al o es qué cuál cuáles cómo como cuándo dónde cuánto cuánta cuántos cuántas por para con mi mis su sus tus lo hay este esta esto usted ustedes tiene tienen da li u na za od iz ili koji koja koje šta sta što kako gde gdje kada kad ima imate mogu može moj moja moje vaš vaša vaše vas vam ja ti vi ste kod po".split(" "));
  const normalized = query.replace(/\b(?:[A-Za-z]\.){2,}[A-Za-z]?/g, acronym => acronym.replaceAll(".", ""));
  return [...new Set(normalized.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(term => !stop.has(term)).slice(0, 16);
}

export function knowledgeLexicalQueries(terms: string[]): { any: string; all: string } {
  // PostgreSQL retains dots in acronyms. Query both spellings without changing source text or indexes.
  const alternatives = terms.map(term => /^[a-z]{2,6}$/.test(term) ? `(${term} | ${term.split("").join(".")})` : term);
  return { any: alternatives.join(" | "), all: alternatives.join(" & ") };
}
