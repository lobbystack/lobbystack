import type { PageIntroId, PageIntroKey } from "@lobbystack/shared";

export type PageIntroState = {
  /** The cards the person has closed, or null when no card may show, as when the list didn't load. */
  seen: ReadonlySet<PageIntroKey> | null;
  /** The card already shown since the dashboard loaded, if any. */
  shownThisVisit: PageIntroId | null;
  /** The person's very first dashboard page, which stays clear of cards. */
  firstPageView: boolean;
  /** Onboarding owns the screen until it ends. */
  onboarding: boolean;
  /** A test call or chat is running in the test window. */
  testCallActive: boolean;
};

/**
 * Whether a page's intro card may open: once per person and page, at most one
 * card each time the dashboard loads, never during onboarding or a test call,
 * and never on the first page of the person's first visit.
 */
export function shouldShowPageIntro(page: PageIntroId, state: PageIntroState): boolean {
  if (!state.seen || state.onboarding || state.firstPageView || state.testCallActive) return false;
  if (state.seen.has(page)) return false;
  return state.shownThisVisit === null || state.shownThisVisit === page;
}

/** How a card closed, as the dismissal event reports it. */
export type PageIntroDismissal = "get_started" | "guide" | "close" | "escape" | "outside";

/** The dismissal for the dialog's own close reasons. */
export function dismissalForReason(reason: string | undefined): PageIntroDismissal {
  if (reason === "escape-key") return "escape";
  if (reason === "outside-press") return "outside";
  return "close";
}
