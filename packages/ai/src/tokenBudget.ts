import { createRequire } from "node:module";
import type { Tiktoken as TiktokenEncoder } from "js-tiktoken/lite";

const require = createRequire(import.meta.url);
let encoder: TiktokenEncoder | undefined;

function getEncoder(): TiktokenEncoder {
  if (!encoder) {
    const { Tiktoken } = require("js-tiktoken/lite") as typeof import("js-tiktoken/lite");
    const o200kBase = require("js-tiktoken/ranks/o200k_base") as typeof import("js-tiktoken/ranks/o200k_base").default;
    encoder = new Tiktoken(o200kBase);
  }
  return encoder;
}

// Versioned text-budget encoding; excludes audio and message-envelope overhead.
export function countKnowledgeTokens(text: string): number {
  return getEncoder().encode(text, [], []).length;
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
