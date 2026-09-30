// Approximates o200k token counts without loading the encoder, which costs
// about 70 MB of heap in every process that builds a prompt. Splits text the
// way the o200k pre-tokenizer does (letter runs, 1-3 digit groups, punctuation
// runs, line breaks). On English, French and JSON passages with UUIDs it
// overcounts by 10-20%, so budgets keep slightly fewer passages.
const PIECE = /\p{L}+|\p{N}{1,3}|[^\s\p{L}\p{N}]+|\n+/gu;

export function countKnowledgeTokens(text: string): number {
  let tokens = 0;
  for (const [piece] of text.matchAll(PIECE)) {
    if (/\p{L}/u.test(piece[0]!)) tokens += Math.ceil(piece.length / 6);
    else if (/[^\s\p{N}]/u.test(piece[0]!)) tokens += Math.ceil(piece.length / 2);
    else tokens += 1;
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
