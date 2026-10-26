import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { listedRouteCapability, requestPathCapability, routeCapability } from "./business-capabilities";

const apiRoot = fileURLToPath(new URL("../../app/api", import.meta.url));

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

/** The URL a route file answers, with each dynamic segment filled in. */
function routePath(file: string): string {
  return `/api/${relative(apiRoot, dirname(file)).split(/[\\/]/).map((segment) => (segment.startsWith("[") ? "x" : segment)).join("/")}`;
}

const operatorRoutes = routeFiles(apiRoot).filter((file) => /\b(operatorRoute|requireOperator)\(/.test(readFileSync(file, "utf8"))).map(routePath);

describe("route capabilities", () => {
  it("lists every route that acts on a business, so none falls to the default by accident", () => {
    expect(operatorRoutes.length).toBeGreaterThan(50);
    expect(operatorRoutes.filter((path) => listedRouteCapability(path) === undefined)).toEqual([]);
  });

  it("puts calls, chats, appointments, contacts and messages under activity, with what every operator needs to land in the business", () => {
    for (const path of ["/api/calls", "/api/calls/x/recording", "/api/messages", "/api/appointments/x/cancel", "/api/contacts/x/passcode", "/api/dashboard", "/api/realtime", "/api/notification-preferences", "/api/preferences/appearance", "/api/account/phone-verification/check", "/api/onboarding/numbers", "/api/onboarding/phone-verification", "/api/onboarding/stage", "/api/usage"]) {
      expect(routeCapability(path), path).toBe("activity");
    }
  });

  it("lets a partner's business's owner reach its billing page at full access, apart from the host's billing", () => {
    for (const path of ["/api/package-billing", "/api/package-billing/checkout", "/api/package-billing/portal"]) expect(routeCapability(path), path).toBe("activity");
  });

  it("keeps billing, API keys and MCP apart from the rest of an owner's and admin's work", () => {
    expect(routeCapability("/api/billing/checkout")).toBe("billing");
    expect(routeCapability("/api/api-keys/x")).toBe("api_keys");
    expect(routeCapability("/api/webhook-endpoints/x/test")).toBe("api_keys");
    expect(routeCapability("/api/webhook-deliveries/x/resend")).toBe("api_keys");
    expect(routeCapability("/api/oauth-grants/x")).toBe("mcp");
    expect(routeCapability("/api/team")).toBe("team");
    for (const path of ["/api/knowledge/snippets/x", "/api/agent", "/api/hours", "/api/catalog/x", "/api/rules", "/api/phone-numbers/replacement/claim", "/api/onboarding/phone-numbers/claim", "/api/integrations/instagram", "/api/widget-keys", "/api/analytics", "/api/voice/live/session"]) {
      expect(routeCapability(path), path).toBe("setup");
    }
  });

  it("reads the path a percent-encoded request reaches, not its spelling, and refuses one that doesn't decode", () => {
    expect(requestPathCapability("/api/%62illing")).toBe("billing");
    expect(requestPathCapability("/api/%77ebhook-endpoints")).toBe("api_keys");
    expect(requestPathCapability("/api/oauth%2Dgrants/x")).toBe("mcp");
    expect(requestPathCapability("/api/calls/%E2%9C%93")).toBe("activity");
    expect(requestPathCapability("/api/%E0%A4%A")).toBeUndefined();
  });

  it("needs setup for a route the table doesn't list, and matches whole path segments only", () => {
    expect(listedRouteCapability("/api/something-new")).toBeUndefined();
    expect(routeCapability("/api/something-new")).toBe("setup");
    expect(listedRouteCapability("/api/callsign")).toBeUndefined();
  });
});
