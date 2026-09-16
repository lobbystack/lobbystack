import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";

let encoder: Tiktoken | undefined;

// Versioned text-budget encoding; excludes audio and message-envelope overhead.
export function countKnowledgeTokens(text: string): number {
  encoder ??= new Tiktoken(o200kBase);
  return encoder.encode(text, [], []).length;
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
