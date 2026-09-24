import { describe, expect, it } from "vitest";

import { countryCodeForBusinessTimezone, resolveBusinessNumberMarket } from "./phoneNumberMarket";

describe("resolveBusinessNumberMarket", () => {
  it("prefers an explicit supported selection over the workspace location", () => {
    expect(resolveBusinessNumberMarket({ selection: { countryCode: "GB", areaCode: "020" }, timezone: "America/Toronto" })).toEqual({
      countryCode: "GB",
      areaCode: "020",
      source: "selection",
    });
  });

  it("derives a supported country from the workspace timezone when no selection is given", () => {
    expect(resolveBusinessNumberMarket({ timezone: "America/Toronto" })).toEqual({ countryCode: "CA", source: "business_location" });
    expect(resolveBusinessNumberMarket({ timezone: "America/Los_Angeles" })).toEqual({ countryCode: "US", source: "business_location" });
    expect(resolveBusinessNumberMarket({ timezone: "Europe/London" })).toEqual({ countryCode: "GB", source: "business_location" });
    expect(resolveBusinessNumberMarket({ timezone: "Australia/Sydney" })).toEqual({ countryCode: "AU", source: "business_location" });
  });

  it("falls back to the default supported country without a personal phone or mapped location", () => {
    expect(resolveBusinessNumberMarket({ timezone: "Europe/Paris" })).toEqual({ countryCode: "US", source: "default" });
    expect(resolveBusinessNumberMarket({ timezone: null })).toEqual({ countryCode: "US", source: "default" });
    expect(resolveBusinessNumberMarket({ selection: { countryCode: "FR" }, timezone: "UTC" })).toEqual({ countryCode: "US", source: "default" });
  });
});

describe("countryCodeForBusinessTimezone", () => {
  it("ignores unmapped and empty timezones", () => {
    expect(countryCodeForBusinessTimezone("UTC")).toBeUndefined();
    expect(countryCodeForBusinessTimezone("")).toBeUndefined();
    expect(countryCodeForBusinessTimezone(null)).toBeUndefined();
  });
});
