import { describe, expect, it } from "vitest";

import { planReminderDedupeKey, planReminderDueAt, planReminderOf } from "./planReminder";

describe("planReminderDueAt", () => {
  it("sends the first reminder an hour after the business reached the plans, at any hour", () => {
    expect(planReminderDueAt(new Date("2026-11-12T14:00:00.000Z")).toISOString()).toBe("2026-11-12T15:00:00.000Z");
    // Late at night stays late at night.
    expect(planReminderDueAt(new Date("2026-11-12T23:30:00.000Z"), "first").toISOString()).toBe("2026-11-13T00:30:00.000Z");
  });

  it("sends the second a day after", () => {
    expect(planReminderDueAt(new Date("2026-11-12T14:00:00.000Z"), "second").toISOString()).toBe("2026-11-13T14:00:00.000Z");
  });
});

describe("planReminderDedupeKey", () => {
  it("is one key per business and reminder, the first keeping the key it always had", () => {
    expect(planReminderDedupeKey("b1")).toBe("onboarding-plan-reminder:b1");
    expect(planReminderDedupeKey("b1", "first")).toBe("onboarding-plan-reminder:b1");
    expect(planReminderDedupeKey("b1", "second")).toBe("onboarding-plan-reminder:b1:second");
    expect(planReminderDedupeKey("b1")).not.toBe(planReminderDedupeKey("b2"));
  });
});

describe("planReminderOf", () => {
  it("reads the second from its job's payload, and anything else as the first", () => {
    expect(planReminderOf({ reminder: "second" })).toBe("second");
    expect(planReminderOf({})).toBe("first");
    expect(planReminderOf({ reminder: "third" })).toBe("first");
  });
});
