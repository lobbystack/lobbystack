import { describe, expect, it } from "vitest";

import {
  buildSuggestionContextFromVerifiedPhoneMarket,
  getMetroAreaCodePriority,
  resolveNumberSuggestionContext,
  resolveVerifiedPhoneMarket,
} from "./onboardingPhoneNumbers";

describe("onboarding phone-number suggestion context", () => {
  it("prefers the Quebec City area-code cluster for Quebec City matches", () => {
    const context = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      city: "Quebec City",
      source: "cloudflare",
    });

    expect(context.metroKey).toBe("quebec_city");
    expect(getMetroAreaCodePriority(context)).toEqual(["418", "581", "367"]);
    expect(context.confidence).toBe(0.95);
  });

  it("maps Saint-Nicolas to the Quebec City area-code cluster", () => {
    const context = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      city: "Saint-Nicolas",
      source: "cloudflare",
    });

    expect(context.metroKey).toBe("quebec_city");
    expect(getMetroAreaCodePriority(context)).toEqual(["418", "581", "367"]);
  });

  it("falls back to the nearest metro when only coordinates are available", () => {
    const context = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      latitude: 46.82,
      longitude: -71.22,
      source: "cloudflare",
    });

    expect(context.metroKey).toBe("quebec_city");
    expect(getMetroAreaCodePriority(context)).toEqual(["418", "581", "367"]);
    expect(context.confidence).toBe(0.8);
  });

  it("does not treat an arbitrary city as a trusted metro match", () => {
    const context = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "ON",
      city: "Espanola",
      source: "cloudflare",
    });

    expect(context.metroKey).toBeUndefined();
    expect(getMetroAreaCodePriority(context)).toEqual([]);
    expect(context.confidence).toBe(0.55);
  });

  it("keeps geography-only ranking stable regardless of source", () => {
    const cloudflareContext = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      city: "Longueuil",
      source: "cloudflare",
    });
    const timezoneContext = resolveNumberSuggestionContext({
      countryCode: "CA",
      regionCode: "QC",
      city: "Longueuil",
      source: "timezone",
      timezone: "America/Toronto",
    });

    expect(getMetroAreaCodePriority(cloudflareContext)).toEqual(["450", "579", "354"]);
    expect(getMetroAreaCodePriority(timezoneContext)).toEqual(["450", "579", "354"]);
  });

  it("prefers the exact verified NANP area code before cluster fallbacks", () => {
    const market = resolveVerifiedPhoneMarket({
      phoneE164: "+15817484609",
      countryCode: "CA",
    });
    const context = buildSuggestionContextFromVerifiedPhoneMarket(market);

    expect(market).toMatchObject({
      areaCode: "581",
      metroKey: "quebec_city",
      city: "Quebec City",
      regionCode: "QC",
    });
    expect(getMetroAreaCodePriority(context)).toEqual(["581", "418", "367"]);
  });

  it("keeps exact NANP area-code matching even outside the curated metro map", () => {
    const market = resolveVerifiedPhoneMarket({
      phoneE164: "+14165550123",
      countryCode: "US",
    });
    const context = buildSuggestionContextFromVerifiedPhoneMarket(market);

    expect(market.areaCode).toBe("416");
    expect(market.metroKey).toBeUndefined();
    expect(getMetroAreaCodePriority(context)).toEqual(["416"]);
  });

  it("falls back to same-country best effort for non-NANP numbers", () => {
    const market = resolveVerifiedPhoneMarket({
      phoneE164: "+33123456789",
      countryCode: "FR",
    });

    expect(market).toMatchObject({
      countryCode: "FR",
      source: "verified_phone_country",
      confidence: 0.75,
    });
    expect(market.areaCode).toBeUndefined();
  });
});
