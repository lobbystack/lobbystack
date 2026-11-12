import { describe, expect, it } from "vitest";

import { planReminderDedupeKey, planReminderDueAt } from "./planReminder";

const due = (enteredAt: string, timezone: string) => planReminderDueAt(new Date(enteredAt), timezone).toISOString();

describe("planReminderDueAt", () => {
  it("sends an hour after the business reached the plans during the day", () => {
    expect(due("2026-11-12T14:00:00.000Z", "UTC")).toBe("2026-11-12T15:00:00.000Z");
    // 10:15 in Montreal.
    expect(due("2026-11-12T14:15:00.000Z", "America/Toronto")).toBe("2026-11-12T15:15:00.000Z");
  });

  it("sends at 09:00 the next morning when the hour lands at 21:00 or later", () => {
    // 20:00 in Toronto, due at 21:00 exactly.
    expect(due("2026-07-15T00:00:00.000Z", "America/Toronto")).toBe("2026-07-15T13:00:00.000Z");
    // 22:40, due at 23:40.
    expect(due("2026-07-15T02:40:00.000Z", "America/Toronto")).toBe("2026-07-15T13:00:00.000Z");
  });

  it("sends at 09:00 the same morning when the hour lands before 08:00", () => {
    // 01:00 in Paris, due at 02:00.
    expect(due("2026-06-10T23:00:00.000Z", "Europe/Paris")).toBe("2026-06-11T07:00:00.000Z");
    // Due at 07:59.
    expect(due("2026-06-11T04:59:00.000Z", "Europe/Paris")).toBe("2026-06-11T07:00:00.000Z");
  });

  it("sends at the hour itself from 08:00 until just before 21:00", () => {
    // Due at 08:00 in Paris.
    expect(due("2026-06-11T05:00:00.000Z", "Europe/Paris")).toBe("2026-06-11T06:00:00.000Z");
    // Due at 20:59.
    expect(due("2026-06-11T17:59:00.000Z", "Europe/Paris")).toBe("2026-06-11T18:59:00.000Z");
  });

  it("keeps 09:00 local across the spring change", () => {
    // 01:30 EST on 8 March 2026; the hour after lands at 03:30 EDT.
    expect(due("2026-03-08T06:30:00.000Z", "America/New_York")).toBe("2026-03-08T13:00:00.000Z");
    // 23:30 CET the night before Paris moves to CEST.
    expect(due("2026-03-28T22:30:00.000Z", "Europe/Paris")).toBe("2026-03-29T07:00:00.000Z");
  });

  it("keeps 09:00 local across the autumn change", () => {
    // 01:30 EDT on 1 November 2026; the hour after is 01:30 EST, the repeated hour.
    expect(due("2026-11-01T05:30:00.000Z", "America/New_York")).toBe("2026-11-01T14:00:00.000Z");
    // 22:00 CEST the night before Paris moves back to CET: 09:00 CET is 08:00 UTC.
    expect(due("2026-10-24T20:00:00.000Z", "Europe/Paris")).toBe("2026-10-25T08:00:00.000Z");
  });

  it("works in a zone with a half-hour offset and across a date line", () => {
    // 20:30 in Kolkata, due at 21:30: 09:00 IST the next day.
    expect(due("2026-11-12T15:00:00.000Z", "Asia/Kolkata")).toBe("2026-11-13T03:30:00.000Z");
    // 22:00 on 31 December in Auckland (NZDT, UTC+13): 09:00 on 1 January.
    expect(due("2026-12-31T09:00:00.000Z", "Pacific/Auckland")).toBe("2026-12-31T20:00:00.000Z");
  });

  it("counts an unknown time zone as UTC", () => {
    expect(due("2026-11-12T22:30:00.000Z", "Not/AZone")).toBe("2026-11-13T09:00:00.000Z");
    expect(due("2026-11-12T10:00:00.000Z", "")).toBe("2026-11-12T11:00:00.000Z");
  });
});

describe("planReminderDedupeKey", () => {
  it("is one key per business", () => {
    expect(planReminderDedupeKey("b1")).toBe("onboarding-plan-reminder:b1");
    expect(planReminderDedupeKey("b1")).not.toBe(planReminderDedupeKey("b2"));
  });
});
