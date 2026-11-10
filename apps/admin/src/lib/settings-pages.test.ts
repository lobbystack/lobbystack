import { describe, expect, it } from "vitest";

import type { Capability } from "@lobbystack/domain";

import { localeResources } from "./i18n-resources";
import { ACCOUNT_PAGES, settingsLandingPage, visibleSettingsPages, WORKSPACE_PAGES } from "./settings-pages";

const levels: Record<"direct" | "full" | "activity", readonly Capability[]> = {
  direct: ["activity", "setup", "team", "billing", "api_keys", "mcp"],
  full: ["activity", "setup", "team"],
  activity: ["activity"],
};
const can = (level: keyof typeof levels) => (capability: Capability) => levels[level].includes(capability);
const hrefs = (level: keyof typeof levels, onPartnerBusiness: boolean) => visibleSettingsPages(WORKSPACE_PAGES, can(level), onPartnerBusiness).map((page) => page.href);

describe("settings pages", () => {
  it("shows a direct business every workspace page but the partner's billing and access", () => {
    expect(hrefs("direct", false)).toEqual(["/workspace/business", "/workspace/knowledge", "/workspace/services", "/workspace/employees", "/workspace/team", "/workspace/usage", "/workspace/billing", "/workspace/connections", "/workspace/webhooks", "/workspace/api-keys"]);
  });

  it("keeps billing and API keys off a partner's business at full access, and adds what its owners pay and who opened it", () => {
    expect(hrefs("full", true)).toEqual(["/workspace/business", "/workspace/knowledge", "/workspace/services", "/workspace/employees", "/workspace/team", "/workspace/usage", "/workspace/subscription", "/workspace/connections", "/workspace/partner-access"]);
  });

  it("leaves an activity-only business usage and the partner pages", () => {
    expect(hrefs("activity", true)).toEqual(["/workspace/usage", "/workspace/subscription", "/workspace/partner-access"]);
  });

  it("shows the person's own account pages at every access level", () => {
    expect(visibleSettingsPages(ACCOUNT_PAGES, can("activity"), false).map((page) => page.href)).toEqual(["/account", "/account/appearance", "/account/notifications"]);
  });

  it("lands on Business details, or Usage at activity only, or the account with nothing else", () => {
    expect(settingsLandingPage(can("direct"))).toBe("/workspace/business");
    expect(settingsLandingPage(can("full"), true)).toBe("/workspace/business");
    expect(settingsLandingPage(can("activity"), true)).toBe("/workspace/usage");
    expect(settingsLandingPage((capability) => capability === "api_keys")).toBe("/workspace/webhooks");
    expect(settingsLandingPage(() => false)).toBe("/account");
  });

  it("names every page with a key the English nav namespace has", () => {
    const nav = localeResources.en.nav as { settingsPages: Record<string, string> };
    for (const page of [...ACCOUNT_PAGES, ...WORKSPACE_PAGES]) {
      expect(nav.settingsPages[page.titleKey.slice("settingsPages.".length)], page.href).toEqual(expect.any(String));
    }
  });
});
