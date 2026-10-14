import { describe, expect, it } from "vitest";

import { numberCountries, numberTrialEmailDueAt, numberTrialEndsAt, numberTrialReleaseAt, trialCountries } from "./numberTrials";

describe("number trial clock", () => {
  it("ends at midnight after the 14th day in the business's time zone, counting the purchase day as day 1", () => {
    // Bought at 3 p.m. in Montreal on Oct 11: the trial runs through Oct 24.
    const endsAt = numberTrialEndsAt(new Date("2026-10-11T19:00:00Z"), "America/Toronto");
    expect(endsAt.toISOString()).toBe("2026-10-25T04:00:00.000Z");
  });

  it("keeps the number until the day before Twilio bills its second month", () => {
    expect(numberTrialReleaseAt(new Date("2026-10-11T19:00:00Z")).toISOString()).toBe("2026-11-10T19:00:00.000Z");
  });

  it("sends the reminders at 9 a.m. local on day 10, day 13 and the day after the trial", () => {
    const endsAt = new Date("2026-10-25T04:00:00Z");
    expect(numberTrialEmailDueAt("day10", endsAt, "America/Toronto").toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(numberTrialEmailDueAt("day13", endsAt, "America/Toronto").toISOString()).toBe("2026-10-23T13:00:00.000Z");
    expect(numberTrialEmailDueAt("ended", endsAt, "America/Toronto").toISOString()).toBe("2026-10-25T13:00:00.000Z");
  });
});

describe("number countries", () => {
  it("sells US and Canadian numbers with no registration, and the others once their bundle is set", () => {
    expect(numberCountries({})).toEqual(["US", "CA"]);
    expect(numberCountries({ TWILIO_GB_BUNDLE_SID: "BU1", TWILIO_AU_BUNDLE_SID: "BU2", TWILIO_NZ_BUNDLE_SID: "BU3", TWILIO_NZ_ADDRESS_SID: "AD3" })).toEqual(["US", "CA", "GB", "NZ"]);
    expect(numberCountries({ TWILIO_AU_BUNDLE_SID: "BU2", TWILIO_AU_ADDRESS_SID: "AD2" })).toEqual(["US", "CA", "AU"]);
  });

  it("gives no free trial in Australia, where a number costs $8.25 a month", () => {
    expect(trialCountries({ TWILIO_GB_BUNDLE_SID: "BU1", TWILIO_AU_BUNDLE_SID: "BU2", TWILIO_AU_ADDRESS_SID: "AD2" })).toEqual(["US", "CA", "GB"]);
  });
});
