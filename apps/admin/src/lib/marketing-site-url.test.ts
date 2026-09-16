import { expect, it } from "vitest";

import { localizeMarketingHref } from "./marketing-site-url";

it("points legal links at the translated marketing pages", () => {
  expect(localizeMarketingHref("en", "/terms")).toBe("https://lobbystack.com/terms/");
  expect(localizeMarketingHref("fr", "/terms")).toBe("https://lobbystack.com/fr/terms/");
  expect(localizeMarketingHref("en", "/privacy")).toBe("https://lobbystack.com/privacy/");
  expect(localizeMarketingHref("fr", "/privacy")).toBe("https://lobbystack.com/fr/privacy/");
});

it("leaves external and untranslated targets alone when the locale is English", () => {
  expect(localizeMarketingHref("en", "mailto:support@lobbystack.com")).toBe("mailto:support@lobbystack.com");
  expect(localizeMarketingHref("en", "#pricing")).toBe("#pricing");
  expect(localizeMarketingHref("en", "/status")).toBe("https://lobbystack.com/status/");
});
