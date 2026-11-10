import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ capabilities: ["activity", "setup"] as string[], businessId: "business" as string | null, agents: [] as Array<{ id: string; isDefault: boolean }> }));
// Next's redirect and notFound throw, so nothing after them runs.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }),
  notFound: vi.fn(() => { throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true }); }),
}));
vi.mock("@/lib/dashboard-request", () => ({ readDashboardRequest: async () => ({ businessId: fixture.businessId, user: { id: "user" }, can: (capability: string) => fixture.capabilities.includes(capability) }) }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({}) }));
vi.mock("@lobbystack/domain", () => ({ listAgents: vi.fn(async () => fixture.agents) }));

import PrimaryAgentPage from "./page";

const open = (rest: string[] | undefined, query: Record<string, string | string[]> = {}) => PrimaryAgentPage({ params: Promise.resolve(rest ? { rest } : {}), searchParams: Promise.resolve(query) });

beforeEach(() => {
  fixture.capabilities = ["activity", "setup"];
  fixture.businessId = "business";
  fixture.agents = [{ id: "evenings", isDefault: false }, { id: "front-desk", isDefault: true }];
});

describe("/agents/primary", () => {
  it("opens the default agent", async () => {
    await expect(open(undefined)).rejects.toMatchObject({ to: "/agents/front-desk" });
  });

  it("keeps the rest of the path and the query", async () => {
    await expect(open(["channels", "widget"], { instagram: "success", tab: ["a", "b"] })).rejects.toMatchObject({ to: "/agents/front-desk/channels/widget?instagram=success&tab=a&tab=b" });
  });

  it("sends someone the business doesn't let set up agents Home", async () => {
    fixture.capabilities = ["activity"];
    await expect(open(["rules"])).rejects.toMatchObject({ to: "/" });
  });

  it("finds nothing for a workspace without agents", async () => {
    fixture.agents = [];
    await expect(open(undefined)).rejects.toMatchObject({ notFound: true });
  });
});
