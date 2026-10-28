import { describe, expect, it } from "vitest";

import type { Capability } from "@lobbystack/domain";

import { firstSettingsPage, pageCapability } from "./dashboard-pages";

const levels: Record<"direct" | "full" | "activity", readonly Capability[]> = {
  direct: ["activity", "setup", "team", "billing", "api_keys", "mcp"],
  full: ["activity", "setup", "team"],
  activity: ["activity"],
};

describe("dashboard pages", () => {
  it("puts calls, chats, appointments, contacts, messages and usage under activity, with Home and the person's own settings", () => {
    for (const path of ["/", "/calls", "/calls/x", "/appointments", "/contacts/x", "/messages", "/settings/usage", "/settings/account", "/settings/appearance", "/settings/notifications"]) {
      expect(pageCapability(path), path).toBe("activity");
    }
  });

  it("keeps billing, API keys and MCP apart from the rest of an owner's and admin's work", () => {
    expect(pageCapability("/settings/plan")).toBe("billing");
    expect(pageCapability("/settings/api-keys")).toBe("api_keys");
    expect(pageCapability("/integrations/webhooks")).toBe("api_keys");
    expect(pageCapability("/settings/team")).toBe("team");
    for (const path of ["/agent", "/agent/knowledge", "/analytics", "/integrations", "/widget", "/setup-guide", "/settings/phone-number"]) {
      expect(pageCapability(path), path).toBe("setup");
    }
  });

  it("opens a partner's business's billing page at full access, apart from the host's plan page", () => {
    expect(pageCapability("/settings/subscription")).toBe("activity");
  });

  it("needs setup for a page it doesn't list, and matches whole path segments only", () => {
    expect(pageCapability("/something-new")).toBe("setup");
    expect(pageCapability("/callsign")).toBe("setup");
  });

  it("lets every access level open Settings itself, which only opens its first allowed tab, without opening a new tab under it", () => {
    expect(pageCapability("/settings")).toBe("activity");
    expect(pageCapability("/settings/something-new")).toBe("setup");
  });

  it("opens Settings on Usage at every access level, since every operator sees the business's usage", () => {
    expect(firstSettingsPage((capability) => levels.direct.includes(capability))).toBe("/settings/usage");
    expect(firstSettingsPage((capability) => levels.full.includes(capability))).toBe("/settings/usage");
    expect(firstSettingsPage((capability) => levels.activity.includes(capability))).toBe("/settings/usage");
    expect(firstSettingsPage(() => false)).toBe("/settings/account");
  });
});
