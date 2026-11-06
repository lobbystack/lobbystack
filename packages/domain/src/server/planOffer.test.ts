import { describe, expect, it } from "vitest";

import { PLAN_OFFER_COOLDOWN_MS, PLAN_OFFER_DISMISSALS_BEFORE_PAUSE, PLAN_OFFER_DISMISSAL_PAUSE_MS, planOfferDue } from "./planOffer";

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

  it("stays away for the cooldown after showing, even with a newer test", () => {
    expect(planOfferDue({ completedTestAt: ago(1_000), shownAt: ago(PLAN_OFFER_COOLDOWN_MS - 1), now })).toBe(false);
    expect(PLAN_OFFER_COOLDOWN_MS).toBe(3 * DAY);
  });

  it("needs a test after the last showing once the cooldown is up", () => {
    expect(planOfferDue({ completedTestAt: ago(4 * DAY), shownAt: ago(3 * DAY), now })).toBe(false);
    expect(planOfferDue({ completedTestAt: ago(1_000), shownAt: ago(3 * DAY), now })).toBe(true);
  });

  it("asks again after a test once three dismissals pause it", () => {
    const dismissed = { completedTestAt: ago(1_000), shownAt: ago(PLAN_OFFER_COOLDOWN_MS + 1), dismissals: PLAN_OFFER_DISMISSALS_BEFORE_PAUSE, now };
    expect(planOfferDue(dismissed)).toBe(false);
    expect(planOfferDue({ ...dismissed, shownAt: ago(PLAN_OFFER_DISMISSAL_PAUSE_MS - 1) })).toBe(false);
    expect(planOfferDue({ ...dismissed, shownAt: ago(PLAN_OFFER_DISMISSAL_PAUSE_MS + 1) })).toBe(true);
  });
});
