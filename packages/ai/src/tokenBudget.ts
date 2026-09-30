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

export function selectKnowledgeWithinBudget<T>(items: T[], budget: number, render: (item: T) => string): T[] {
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
