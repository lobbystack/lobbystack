import { describe, expect, it } from "vitest";
import type { PageIntroKey } from "@lobbystack/shared";

import { dismissalForReason, shouldShowPageIntro, type PageIntroState } from "./page-intro-rules";

const state = (overrides: Partial<PageIntroState> = {}): PageIntroState => ({
  seen: new Set<PageIntroKey>(["dashboard"]),
  shownThisVisit: null,
  firstPageView: false,
  onboarding: false,
  testCallActive: false,
  ...overrides,
});

describe("when a page's intro card opens", () => {
  it("opens on a page the person hasn't closed it on", () => {
    expect(shouldShowPageIntro("inbox", state())).toBe(true);
  });

  it("opens once per person and page", () => {
    expect(shouldShowPageIntro("inbox", state({ seen: new Set<PageIntroKey>(["dashboard", "inbox"]) }))).toBe(false);
    expect(shouldShowPageIntro("knowledge", state({ seen: new Set<PageIntroKey>(["dashboard", "inbox"]) }))).toBe(true);
  });

  it("opens one card per visit", () => {
    expect(shouldShowPageIntro("knowledge", state({ shownThisVisit: "inbox" }))).toBe(false);
    // The card already open stays open.
    expect(shouldShowPageIntro("inbox", state({ shownThisVisit: "inbox" }))).toBe(true);
  });

  it("never opens during onboarding", () => {
    expect(shouldShowPageIntro("inbox", state({ onboarding: true }))).toBe(false);
  });

  it("skips the first page of the person's first visit", () => {
    expect(shouldShowPageIntro("inbox", state({ seen: new Set(), firstPageView: true }))).toBe(false);
    // The next page they open may show its card.
    expect(shouldShowPageIntro("inbox", state({ seen: new Set(), firstPageView: false }))).toBe(true);
  });

  it("waits while a test call runs", () => {
    expect(shouldShowPageIntro("inbox", state({ testCallActive: true }))).toBe(false);
  });

  it("stays shut when the closed cards couldn't be read", () => {
    expect(shouldShowPageIntro("inbox", state({ seen: null }))).toBe(false);
  });
});

it("names how the dialog closed", () => {
  expect(dismissalForReason("escape-key")).toBe("escape");
  expect(dismissalForReason("outside-press")).toBe("outside");
  expect(dismissalForReason("close-press")).toBe("close");
  expect(dismissalForReason(undefined)).toBe("close");
});
