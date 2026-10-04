// Approximates o200k token counts without loading the encoder, which costs
// about 70 MB of heap in every process that builds a prompt. Splits text the
// way the o200k pre-tokenizer does (words, 1-3 digit groups, symbol runs, line
// breaks), then charges one token per Han, kana or Hangul character, one per 4
// UTF-8 bytes of other words and one per 2 bytes of symbols. Charging by bytes
// makes Cyrillic, Greek, Arabic, Hebrew and Indic words cost more than Latin
// ones, as they do in o200k. Measured against o200k on 22 samples across 18
// languages, JSON and emoji, the estimate ran 1.0x to 2.2x the real count, so
// budgets keep fewer passages rather than overflowing.
const PIECE = /[\p{L}\p{M}]+|\p{N}{1,3}|[^\s\p{L}\p{M}\p{N}]+|\n+/gu;
const WORD = /^[\p{L}\p{M}]/u;
const SYMBOL = /^[^\s\p{N}]/u;
const PER_CHARACTER_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function countKnowledgeTokens(text: string): number {
  let tokens = 0;
  for (const [piece] of text.matchAll(PIECE)) {
    if (WORD.test(piece)) {
      tokens += PER_CHARACTER_SCRIPT.test(piece) ? [...piece].length : Math.ceil(utf8Length(piece) / 4);
    } else if (SYMBOL.test(piece)) {
      tokens += Math.ceil(utf8Length(piece) / 2);
    } else {
      tokens += 1;
    }
  }
  return tokens;
}

export function withinKnowledgeBudget<T>(items: T[], budget: number, render: (item: T) => string): T[] {
  const selected: T[] = [];
  let used = 0;
  for (const item of items) {
    const size = countKnowledgeTokens(render(item) + "\n");
    if (used + size > budget) continue;
    selected.push(item);
    used += size;
  }
  return selected;
}

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
  // The stop list mixes languages, so an English "PO" or "LA" collides with a Serbian or
  // French function word. Keep short capitalized tokens unless the whole query is in capitals.
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const mixedCase = /\p{Ll}/u.test(normalized);
  const acronyms = new Set(mixedCase ? words.filter(word => word.length >= 2 && word === word.toLocaleUpperCase() && /\p{Lu}/u.test(word)).map(word => word.toLocaleLowerCase()) : []);
  return [...new Set(words.map(word => word.toLocaleLowerCase()))].filter(term => acronyms.has(term) || !stop.has(term)).slice(0, 16);
}

export function knowledgeLexicalQueries(terms: string[]): { any: string; all: string } {
  // PostgreSQL retains dots in acronyms. Query both spellings without changing source text or indexes.
  const alternatives = terms.map(term => /^[a-z]{2,6}$/.test(term) ? `(${term} | ${term.split("").join(".")})` : term);
  return { any: alternatives.join(" | "), all: alternatives.join(" & ") };
}
