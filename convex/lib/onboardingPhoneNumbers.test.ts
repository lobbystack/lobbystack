import { describe, expect, it } from "vitest";

import {
  getMetroAreaCodePriority,
  resolveNumberSuggestionContext,
} from "./onboardingPhoneNumbers";

describe("onboarding phone-number suggestion context", () => {
  it("prefers the Quebec City area-code cluster for Quebec City matches", () => {
    const context = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      city: "Quebec City",
      source: "ipinfo",
    });

    expect(context.metroKey).toBe("quebec_city");
    expect(getMetroAreaCodePriority(context)).toEqual(["418", "581", "367"]);
    expect(context.confidence).toBe(0.95);
  });

  it("falls back to the nearest metro when only coordinates are available", () => {
    const context = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      latitude: 46.82,
      longitude: -71.22,
      source: "ipinfo",
    });

    expect(context.metroKey).toBe("quebec_city");
    expect(getMetroAreaCodePriority(context)).toEqual(["418", "581", "367"]);
    expect(context.confidence).toBe(0.8);
  });

  it("keeps geography-only ranking stable regardless of source", () => {
    const ipinfoContext = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      city: "Longueuil",
      source: "ipinfo",
    });
    const timezoneContext = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      city: "Longueuil",
      source: "timezone",
      timezone: "America/Toronto",
    });

    expect(getMetroAreaCodePriority(ipinfoContext)).toEqual(["450", "579", "354"]);
    expect(getMetroAreaCodePriority(timezoneContext)).toEqual(["450", "579", "354"]);
  });
});
