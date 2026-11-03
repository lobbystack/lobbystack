import { describe, expect, it } from "vitest";

import { PLAN_OFFER_COOLDOWN_MS, planOfferDue } from "./planOffer";

const now = new Date("2026-11-20T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const DAY = 24 * 60 * 60_000;

describe("planOfferDue", () => {
  it("waits for a completed test", () => {
    expect(planOfferDue({ completedTestAt: null, shownAt: null, now })).toBe(false);
  });

  it("shows after the first completed test", () => {
    expect(planOfferDue({ completedTestAt: ago(1_000), shownAt: null, now })).toBe(true);
  });

  it("stays away for a week after showing, even with a newer test", () => {
    expect(planOfferDue({ completedTestAt: ago(1_000), shownAt: ago(PLAN_OFFER_COOLDOWN_MS - 1), now })).toBe(false);
  });

  it("needs a test after the last showing once the week is up", () => {
    expect(planOfferDue({ completedTestAt: ago(8 * DAY), shownAt: ago(7 * DAY), now })).toBe(false);
    expect(planOfferDue({ completedTestAt: ago(1_000), shownAt: ago(7 * DAY), now })).toBe(true);
  });
});
