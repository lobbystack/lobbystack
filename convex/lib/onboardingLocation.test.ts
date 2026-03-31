import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractClientIpAddress, inferOnboardingLocationContext } from "./onboardingLocation";

describe("onboarding location inference", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts the first public IP address from proxy headers", () => {
    const request = new Request("https://example.com/onboarding/location", {
      headers: {
        "x-forwarded-for": "10.0.0.1, 203.0.113.18, 127.0.0.1",
      },
    });

    expect(extractClientIpAddress(request)).toBe("203.0.113.18");
  });

  it("uses Cloudflare visitor location headers when available", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const context = await inferOnboardingLocationContext({
      request: new Request("https://example.com/onboarding/location", {
        headers: {
          "cf-ipcountry": "CA",
          "cf-region-code": "QC",
          "cf-ipcity": "Saint-Nicolas",
          "cf-postal-code": "G7A",
          "cf-timezone": "America/Toronto",
          "cf-iplatitude": "46.7098",
          "cf-iplongitude": "-71.3720",
          "x-forwarded-for": "203.0.113.18",
        },
      }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      countryCode: "CA",
      regionCode: "QC",
      city: "Saint-Nicolas",
      postalCode: "G7A",
      metroKey: "quebec_city",
      source: "cloudflare",
    });
  });

  it("falls back to timezone inference when ip geolocation is unavailable", async () => {
    const context = await inferOnboardingLocationContext({
      request: new Request("https://example.com/onboarding/location"),
      timezoneHint: "America/Toronto",
    });

    expect(context).toMatchObject({
      countryCode: "CA",
      source: "timezone",
      timezone: "America/Toronto",
    });
  });
});
