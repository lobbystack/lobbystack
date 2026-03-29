import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractClientIpAddress, inferOnboardingLocationContext } from "./onboardingLocation";

const originalIpInfoToken = process.env.IPINFO_TOKEN;

describe("onboarding location inference", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.IPINFO_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.IPINFO_TOKEN = originalIpInfoToken;
  });

  it("extracts the first public IP address from proxy headers", () => {
    const request = new Request("https://example.com/onboarding/location", {
      headers: {
        "x-forwarded-for": "10.0.0.1, 203.0.113.18, 127.0.0.1",
      },
    });

    expect(extractClientIpAddress(request)).toBe("203.0.113.18");
  });

  it("uses ipinfo geo data when available", async () => {
    process.env.IPINFO_TOKEN = "test-ipinfo-token";
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          city: "Quebec City",
          region_code: "QC",
          country_code: "CA",
          postal_code: "G1R",
          timezone: "America/Toronto",
          latitude: 46.8139,
          longitude: -71.208,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const context = await inferOnboardingLocationContext({
      request: new Request("https://example.com/onboarding/location", {
        headers: {
          "x-forwarded-for": "203.0.113.18",
        },
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(context).toMatchObject({
      countryCode: "CA",
      regionCode: "QC",
      city: "Quebec City",
      postalCode: "G1R",
      metroKey: "quebec_city",
      source: "ipinfo",
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
