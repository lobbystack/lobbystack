import { describe, expect, it } from "vitest";

import { nextPartnerState, partnerLifecycleDates, partnerLifecycleDeadlines, partnerStates, partnerTierEventKind, type PartnerEvent, type PartnerStanding, type PartnerState } from "./partnerLifecycle";

const DAY = 24 * 60 * 60_000;
// The tier ended, or the payment failed, at the start of this day.
const start = new Date("2026-11-01T00:00:00.000Z");
const day = (days: number) => new Date(start.getTime() + days * DAY);
const at = (state: PartnerState, since: Date, tierEndedAt: Date | null = null): PartnerStanding => ({ state, since, tierEndedAt });
const event = (kind: PartnerEvent["kind"], when: Date): PartnerEvent => ({ kind, at: when });

// Every state, with an event of each kind, and where the partner stands after it.
const transitions: Array<[label: string, current: PartnerStanding, event: PartnerEvent, next: PartnerStanding]> = [
  ["an active partner stays active when its tier is paid", at("active", day(-60)), event("tier_paid", day(0)), at("active", day(-60))],
  ["an active partner whose payment fails is past due from then, with its tier still in force", at("active", day(-60)), event("tier_failed", day(0)), at("past_due", day(0))],
  ["an active partner whose tier ends is ending from then", at("active", day(-60)), event("tier_cancelled", day(0)), at("ending", day(0), day(0))],
  ["an active partner stays active on the clock", at("active", day(-60)), event("clock", day(200)), at("active", day(-60))],

  ["a past due partner that pays is active again", at("past_due", day(0)), event("tier_paid", day(5)), at("active", day(5))],
  ["a past due partner keeps the day its first payment failed when Polar's retry fails", at("past_due", day(0)), event("tier_failed", day(7)), at("past_due", day(0))],
  ["a past due partner whose tier is revoked is ending: it pauses 30 days after the failed payment, and the 90 days count from the end", at("past_due", day(0)), event("tier_cancelled", day(21)), at("ending", day(0), day(21))],
  ["a past due partner keeps answering for 30 days", at("past_due", day(0)), event("clock", new Date(day(30).getTime() - 1)), at("past_due", day(0))],
  ["a past due partner pauses 30 days after the failed payment", at("past_due", day(0)), event("clock", day(30)), at("paused", day(30))],
  ["a past due partner whose tier never ended isn't deleted, however late the clock runs", at("past_due", day(0)), event("clock", day(400)), at("paused", day(30))],

  ["an ending partner that pays for a tier again is active", at("ending", day(0), day(0)), event("tier_paid", day(12)), at("active", day(12))],
  ["an ending partner stays ending when a payment fails", at("ending", day(0), day(0)), event("tier_failed", day(3)), at("ending", day(0), day(0))],
  ["an ending partner keeps the day its tier ended when it's cancelled again", at("ending", day(0), day(0)), event("tier_cancelled", day(4)), at("ending", day(0), day(0))],
  ["an ending partner keeps answering for 30 days", at("ending", day(0), day(0)), event("clock", day(29)), at("ending", day(0), day(0))],
  ["an ending partner pauses 30 days after its tier ended, however late the clock runs", at("ending", day(0), day(0)), event("clock", new Date(day(30).getTime() + 59 * 60_000)), at("paused", day(30), day(0))],
  ["an ending partner the clock missed for 90 days reaches deletion", at("ending", day(0), day(0)), event("clock", day(90)), at("deleted", day(90), day(0))],

  ["a paused partner that pays for a tier again is active", at("paused", day(30), day(0)), event("tier_paid", day(40)), at("active", day(40))],
  ["a paused partner stays paused when a payment fails", at("paused", day(30), day(0)), event("tier_failed", day(40)), at("paused", day(30), day(0))],
  ["a partner paused while Polar retried learns when its tier ended", at("paused", day(30)), event("tier_cancelled", day(40)), at("paused", day(30), day(40))],
  ["a paused partner whose tier ended keeps that day when it's cancelled again", at("paused", day(30), day(0)), event("tier_cancelled", day(40)), at("paused", day(30), day(0))],
  ["a paused partner stays paused until 90 days after its tier ended", at("paused", day(30), day(0)), event("clock", day(89)), at("paused", day(30), day(0))],
  ["a paused partner reaches deletion 90 days after its tier ended", at("paused", day(30), day(0)), event("clock", day(90)), at("deleted", day(90), day(0))],
  ["a partner paused while its tier is still in force stays paused on the clock", at("paused", day(30)), event("clock", day(400)), at("paused", day(30))],

  ["a deleted partner that pays for a tier again is active", at("deleted", day(90), day(0)), event("tier_paid", day(100)), at("active", day(100))],
  ["a deleted partner stays deleted when a payment fails", at("deleted", day(90), day(0)), event("tier_failed", day(100)), at("deleted", day(90), day(0))],
  ["a deleted partner stays deleted when a tier is cancelled", at("deleted", day(90), day(0)), event("tier_cancelled", day(100)), at("deleted", day(90), day(0))],
  ["a deleted partner stays deleted on the clock", at("deleted", day(90), day(0)), event("clock", day(400)), at("deleted", day(90), day(0))],
];

describe("nextPartnerState", () => {
  it.each(transitions)("%s", (_label, current, next, expected) => {
    expect(nextPartnerState(current, next)).toEqual(expected);
  });

  it("covers every state with every kind of event", () => {
    const covered = new Set(transitions.map(([, current, next]) => `${current.state}:${next.kind}`));
    for (const state of partnerStates) for (const kind of ["tier_paid", "tier_failed", "tier_cancelled", "clock"]) expect(covered).toContain(`${state}:${kind}`);
  });

  it("returns the partner as it was when an event doesn't move it, so the caller applies nothing", () => {
    const current = at("ending", day(0), day(0));
    expect(nextPartnerState(current, event("clock", day(10)))).toBe(current);
    expect(nextPartnerState(current, event("tier_cancelled", day(10)))).toBe(current);
  });

  it("walks a cancelled tier from answering to paused at 30 days and deletion at 90", () => {
    let standing = nextPartnerState(at("active", day(-365)), event("tier_cancelled", day(0)));
    for (let hour = 1; hour <= 100 * 24; hour += 1) standing = nextPartnerState(standing, event("clock", new Date(start.getTime() + hour * 60 * 60_000)));
    expect(standing).toEqual(at("deleted", day(90), day(0)));
    expect(nextPartnerState(nextPartnerState(at("ending", day(0), day(0)), event("clock", day(30))), event("clock", day(60)))).toEqual(at("paused", day(30), day(0)));
  });

  it("pauses 30 days after a failed payment, and deletes 90 days after Polar revokes the tier, not after the payment", () => {
    let standing = nextPartnerState(at("active", day(-365)), event("tier_failed", day(0)));
    standing = nextPartnerState(standing, event("clock", day(30)));
    expect(standing).toEqual(at("paused", day(30)));
    standing = nextPartnerState(standing, event("tier_cancelled", day(45)));
    for (const when of [day(90), day(134)]) expect(nextPartnerState(standing, event("clock", when))).toBe(standing);
    expect(nextPartnerState(standing, event("clock", day(135)))).toEqual(at("deleted", day(135), day(45)));
  });

  it("pauses at the earlier of the failed payment's 30 days and the tier's end's", () => {
    // Polar revoked the tier a day after the payment failed, and reported it late.
    expect(nextPartnerState(at("past_due", day(1)), event("tier_cancelled", day(0)))).toEqual(at("ending", day(0), day(0)));
  });
});

describe("partnerLifecycleDates", () => {
  it("gives the console the same three days in every state after the tier ended", () => {
    for (const [standing, days] of [
      [at("ending", day(0), day(0)), { tierEndedAt: day(0), pausesAt: day(30), deletesAt: day(90) }],
      [at("paused", day(30), day(0)), { tierEndedAt: day(0), pausesAt: day(30), deletesAt: day(90) }],
      [at("deleted", day(90), day(0)), { tierEndedAt: day(0), pausesAt: null, deletesAt: day(90) }],
    ] as const) expect(partnerLifecycleDates(standing)).toEqual(days);
  });

  it("has no deletion date while a past due tier is still in force", () => {
    expect(partnerLifecycleDates(at("past_due", day(0)))).toEqual({ tierEndedAt: null, pausesAt: day(30), deletesAt: null });
    expect(partnerLifecycleDates(at("paused", day(30)))).toEqual({ tierEndedAt: null, pausesAt: day(30), deletesAt: null });
  });

  it("keeps the pause from the failed payment and dates the deletion from the tier's end", () => {
    let standing = nextPartnerState(at("active", day(-60)), event("tier_failed", day(0)));
    standing = nextPartnerState(standing, event("tier_cancelled", day(10)));
    expect(partnerLifecycleDates(standing)).toEqual({ tierEndedAt: day(10), pausesAt: day(30), deletesAt: day(100) });
    standing = nextPartnerState(standing, event("clock", day(31)));
    expect(partnerLifecycleDates(standing)).toEqual({ tierEndedAt: day(10), pausesAt: day(30), deletesAt: day(100) });
    standing = nextPartnerState(standing, event("clock", day(101)));
    expect(standing.state).toBe("deleted");
    expect(partnerLifecycleDates(standing)).toEqual({ tierEndedAt: day(10), pausesAt: null, deletesAt: day(100) });
  });

  it("has none for an active partner", () => {
    expect(partnerLifecycleDates(at("active", day(0)))).toBeNull();
  });
});

describe("partnerLifecycleDeadlines", () => {
  it("pauses 30 days after the days began and deletes 90 days after the tier ended", () => {
    expect(partnerLifecycleDeadlines(at("ending", day(0), day(0)))).toEqual({ pausesAt: day(30), deletesAt: day(90) });
    expect(partnerLifecycleDeadlines(at("ending", day(0), day(20)))).toEqual({ pausesAt: day(30), deletesAt: day(110) });
    expect(partnerLifecycleDeadlines(at("paused", day(30), day(0)))).toEqual({ pausesAt: null, deletesAt: day(90) });
  });

  it("has no deletion while the tier is still in force", () => {
    expect(partnerLifecycleDeadlines(at("past_due", day(0)))).toEqual({ pausesAt: day(30), deletesAt: null });
    expect(partnerLifecycleDeadlines(at("paused", day(30)))).toEqual({ pausesAt: null, deletesAt: null });
  });

  it("has no deadline for an active or deleted partner", () => {
    expect(partnerLifecycleDeadlines(at("active", day(0)))).toEqual({ pausesAt: null, deletesAt: null });
    expect(partnerLifecycleDeadlines(at("deleted", day(90), day(0)))).toEqual({ pausesAt: null, deletesAt: null });
  });
});

describe("partnerTierEventKind", () => {
  const tier = (name: string, subscriptionState: string | null) => ({ tier: name, subscriptionState });

  it("sends nothing for a partner that never held a paid tier, Free or a checkout it never paid", () => {
    expect(partnerTierEventKind(null, null)).toBeNull();
    expect(partnerTierEventKind(null, tier("free", null))).toBeNull();
    expect(partnerTierEventKind(null, tier("growth", "incomplete"))).toBeNull();
    expect(partnerTierEventKind(tier("growth", "incomplete"), tier("growth", "incomplete_expired"))).toBeNull();
  });

  it("calls a live paid tier paid, and failed while its subscription is past due", () => {
    expect(partnerTierEventKind(null, tier("starter", "active"))).toBe("tier_paid");
    expect(partnerTierEventKind(tier("scale", "canceled"), tier("starter", "trialing"))).toBe("tier_paid");
    expect(partnerTierEventKind(tier("starter", "active"), tier("starter", "past_due"))).toBe("tier_failed");
    expect(partnerTierEventKind(tier("starter", "past_due"), tier("starter", "active"))).toBe("tier_paid");
  });

  it("calls a paid tier that's no longer in force cancelled, whatever ended it", () => {
    expect(partnerTierEventKind(tier("scale", "active"), tier("scale", "canceled"))).toBe("tier_cancelled");
    expect(partnerTierEventKind(tier("scale", "past_due"), tier("scale", "unpaid"))).toBe("tier_cancelled");
    // Once it's over, later news of the same ended subscription sends nothing more.
    expect(partnerTierEventKind(tier("scale", "canceled"), tier("scale", "canceled"))).toBeNull();
  });
});
