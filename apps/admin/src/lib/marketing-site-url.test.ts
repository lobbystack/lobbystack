import { afterEach, describe, expect, it, vi } from "vitest";

import { affiliateTermsHref, localizeMarketingHref, privacyHref, termsHref } from "./marketing-site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("points legal links at the translated marketing pages", () => {
  expect(localizeMarketingHref("en", "/terms")).toBe("https://lobbystack.com/terms/");
  expect(localizeMarketingHref("fr", "/terms")).toBe("https://lobbystack.com/fr/terms/");
  expect(localizeMarketingHref("en", "/privacy")).toBe("https://lobbystack.com/privacy/");
  expect(localizeMarketingHref("fr", "/privacy")).toBe("https://lobbystack.com/fr/privacy/");
  expect(termsHref("fr")).toBe("https://lobbystack.com/fr/terms/");
  expect(privacyHref("en")).toBe("https://lobbystack.com/privacy/");
  expect(affiliateTermsHref("fr")).toBe("https://lobbystack.com/fr/terms/#affiliate-program");
});

it("leaves external and untranslated targets alone when the locale is English", () => {
  expect(localizeMarketingHref("en", "mailto:support@lobbystack.com")).toBe("mailto:support@lobbystack.com");
  expect(localizeMarketingHref("en", "#pricing")).toBe("#pricing");
  expect(localizeMarketingHref("en", "/status")).toBe("https://lobbystack.com/status/");
});

describe("a deployment's own site", () => {
  it("keeps each path on the deployment's domain, in every language", () => {
    vi.stubEnv("NEXT_PUBLIC_LANDING_SITE_URL", "https://acme.example/");
    expect(localizeMarketingHref("en", "/")).toBe("https://acme.example/");
    expect(localizeMarketingHref("fr", "/")).toBe("https://acme.example/");
    expect(termsHref("sr")).toBe("https://acme.example/terms");
    expect(privacyHref("es")).toBe("https://acme.example/privacy");
    expect(affiliateTermsHref("fr")).toBe("https://acme.example/terms/#affiliate-program");
  });

  it("keeps the path of a site served under one", () => {
    vi.stubEnv("NEXT_PUBLIC_LANDING_SITE_URL", "https://example.com/receptionist/");
    expect(localizeMarketingHref("fr", "/")).toBe("https://example.com/receptionist/");
    expect(termsHref("en")).toBe("https://example.com/receptionist/terms");
  });

  it("opens the deployment's own terms and privacy pages", () => {
    vi.stubEnv("NEXT_PUBLIC_LANDING_SITE_URL", "https://acme.example");
    vi.stubEnv("NEXT_PUBLIC_TERMS_URL", "https://acme.example/legal/terms");
    vi.stubEnv("NEXT_PUBLIC_PRIVACY_URL", "https://acme.example/legal/privacy");
    for (const locale of ["en", "fr", "es", "sr"] as const) {
      expect(termsHref(locale)).toBe("https://acme.example/legal/terms");
      expect(privacyHref(locale)).toBe("https://acme.example/legal/privacy");
      expect(affiliateTermsHref(locale)).toBe("https://acme.example/legal/terms");
    }
  });

  it("links to LobbyStack's site when the variable is empty or unusable", () => {
    vi.stubEnv("NEXT_PUBLIC_LANDING_SITE_URL", "");
    expect(termsHref("en")).toBe("https://lobbystack.com/terms/");
    vi.stubEnv("NEXT_PUBLIC_LANDING_SITE_URL", "acme.example");
    expect(termsHref("fr")).toBe("https://lobbystack.com/fr/terms/");
  });
});
