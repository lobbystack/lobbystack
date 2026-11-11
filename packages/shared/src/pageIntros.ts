// The dashboard pages that open with an intro card the first time a person
// visits them. Migration 0206 keeps the cards each person has closed.

export const PAGE_INTRO_IDS = ["inbox", "appointments", "agents", "rules", "channels", "knowledge", "services", "employees"] as const;

export type PageIntroId = (typeof PAGE_INTRO_IDS)[number];

/** The row that records a person's first dashboard visit, which shows no card. */
export const FIRST_DASHBOARD_VISIT = "dashboard";

/** Every key a person's row can hold: one per card, and the first visit. */
export const PAGE_INTRO_KEYS = [...PAGE_INTRO_IDS, FIRST_DASHBOARD_VISIT] as const;

export type PageIntroKey = (typeof PAGE_INTRO_KEYS)[number];

export function isPageIntroKey(value: unknown): value is PageIntroKey {
  return typeof value === "string" && (PAGE_INTRO_KEYS as readonly string[]).includes(value);
}
