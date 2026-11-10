import { describe, expect, it } from "vitest";

import { pageCapability } from "./dashboard-pages";

describe("dashboard pages", () => {
  it("puts the Inbox, appointments, contacts and usage under activity, with Home and the person's own settings", () => {
    for (const path of ["/", "/appointments", "/contacts/x", "/inbox", "/workspace/usage", "/account", "/account/appearance", "/account/notifications"]) {
      expect(pageCapability(path), path).toBe("activity");
    }
  });

  it("keeps billing, API keys and MCP apart from the rest of an owner's and admin's work", () => {
    expect(pageCapability("/workspace/billing")).toBe("billing");
    expect(pageCapability("/workspace/api-keys")).toBe("api_keys");
    expect(pageCapability("/workspace/webhooks")).toBe("api_keys");
    expect(pageCapability("/workspace/team")).toBe("team");
    for (const path of ["/agents", "/agents/x", "/agents/x/channels/phone", "/agents/x/channels/widget", "/agents/x/handling", "/analytics", "/workspace/business", "/workspace/knowledge", "/workspace/services", "/workspace/employees", "/workspace/connections", "/workspace/something-new"]) {
      expect(pageCapability(path), path).toBe("setup");
    }
  });

  it("opens a partner's business's billing page and partner access at full access, apart from the host's plan page", () => {
    expect(pageCapability("/workspace/subscription")).toBe("activity");
    expect(pageCapability("/workspace/partner-access")).toBe("activity");
  });

  it("lets every access level open Settings and Workspace themselves, which only open the first allowed page", () => {
    expect(pageCapability("/settings")).toBe("activity");
    expect(pageCapability("/workspace")).toBe("activity");
    expect(pageCapability("/settings/something-new")).toBe("setup");
    expect(pageCapability("/accounting")).toBe("setup");
  });

  it("needs setup for a page it doesn't list, and matches whole path segments only", () => {
    expect(pageCapability("/something-new")).toBe("setup");
    expect(pageCapability("/inboxes")).toBe("setup");
  });
});
