import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reserve: vi.fn(async () => 2) }));
vi.mock("@lobbystack/domain", () => ({ reserveMissingPartnerSubdomains: mocks.reserve }));
vi.mock("./domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));

import { reserveMissingPartnerSubdomainsAtStartup } from "./partner-subdomains";

const startup = (environment: Record<string, string | undefined>, phase?: string) => ({ runtime: "nodejs", phase, environment });

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("reserving partner subdomains at startup", () => {
  it("reserves them under the partner base domain, in development as in production", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(await reserveMissingPartnerSubdomainsAtStartup(startup({ PARTNER_BASE_DOMAIN: "portal.example.test", NODE_ENV: "development" }))).toBe(2);
    expect(mocks.reserve).toHaveBeenCalledWith({ db: "app" });
    expect(info).toHaveBeenCalledWith("[partners] Reserved 2 partner subdomains under portal.example.test.");
  });

  it.each([
    ["no partner base domain", startup({ NODE_ENV: "production" })],
    ["an unusable partner base domain", startup({ PARTNER_BASE_DOMAIN: "https://portal.example.test" })],
    ["a production build", startup({ PARTNER_BASE_DOMAIN: "portal.example.test" }, "phase-production-build")],
    ["maintenance mode", startup({ PARTNER_BASE_DOMAIN: "portal.example.test", LOBBYSTACK_MAINTENANCE_MODE: "true" })],
    ["the edge runtime", { runtime: "edge", phase: undefined, environment: { PARTNER_BASE_DOMAIN: "portal.example.test" } }],
  ])("does nothing with %s", async (_case, context) => {
    expect(await reserveMissingPartnerSubdomainsAtStartup(context)).toBeNull();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
