import type { Capability } from "@lobbystack/domain";

import { pageCapability } from "@/lib/dashboard-pages";
import type { SearchEntry, Synonyms } from "./catalog";

export type SearchScope = {
  entries: readonly SearchEntry[];
  synonyms: Synonyms;
  can: (capability: Capability) => boolean;
  /** Whether the person opens the pages a partner's business shows its owners and admins. */
  opensPartnerBilling?: boolean;
};

/** What this person may open. Search never lists a page the menus would hide. */
function allowed(entry: SearchEntry, scope: SearchScope): boolean {
  if (entry.partnerBusinessOnly && !scope.opensPartnerBilling) return false;
  return scope.can(pageCapability(entry.href));
}

/** The synonym's tags, for the word itself or, once it's three letters, any word it starts. */
function synonymTags(word: string, synonyms: Synonyms): string[] {
  if (synonyms[word]) return synonyms[word];
  if (word.length < 3) return [];
  return Object.entries(synonyms).filter(([key]) => key.startsWith(word)).flatMap(([, tags]) => tags);
}

/** Folds accents away, so "general" finds "Général" and "pagina" finds "Página". */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function wordScore(word: string, entry: SearchEntry, synonyms: Synonyms): number {
  const title = foldText(entry.title);
  if (title.split(/[\s,]+/u).some((part) => part.startsWith(word))) return 4;
  if (title.includes(word)) return 3;
  if (entry.tags.some((tag) => tag.startsWith(word))) return 2;
  const tags = synonymTags(word, synonyms);
  return entry.tags.some((tag) => tags.includes(tag)) ? 1 : 0;
}

/** Pages, settings and agents for a query, best first. Every word must match. */
export function searchEntries(query: string, scope: SearchScope, limit = 8): SearchEntry[] {
  const words = foldText(query).split(/\s+/u).filter(Boolean);
  if (!words.length) return [];
  const synonyms = Object.fromEntries(Object.entries(scope.synonyms).map(([word, tags]) => [foldText(word), tags]));
  return scope.entries
    .filter((entry) => allowed(entry, scope))
    .map((entry, index) => {
      const scores = words.map((word) => wordScore(word, entry, synonyms));
      return { entry, index, score: scores.every(Boolean) ? scores.reduce((sum, value) => sum + value, 0) : 0 };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.entry);
}
