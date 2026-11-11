import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AGENT = "6f1c2b9e-1d4a-4c3b-9a55-0f2e3d4c5b6a";
const fixture = vi.hoisted(() => ({ capabilities: ["activity", "setup"] as string[], agents: new Map<string, { id: string; name: string }>() }));
// Next's redirect and notFound throw, so nothing after them runs.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }),
  notFound: vi.fn(() => { throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true }); }),
}));
vi.mock("@/lib/dashboard-request", () => ({ readDashboardRequest: async () => ({ businessId: "business", user: { id: "user" }, can: (capability: string) => fixture.capabilities.includes(capability) }) }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({}) }));
vi.mock("@/components/agent-shell", () => ({ AgentShell: () => null }));
vi.mock("@lobbystack/domain", () => ({
  getAgent: vi.fn(async (_context: unknown, input: { agentId: string }) => {
    const agent = fixture.agents.get(input.agentId);
    if (!agent) throw Object.assign(new Error("Agent not found."), { status: 404 });
    return agent;
  }),
}));

import AgentLayout from "./layout";

const open = (agentId: string) => AgentLayout({ children: null, params: Promise.resolve({ agentId }) });

beforeEach(() => {
  fixture.capabilities = ["activity", "setup"];
  fixture.agents = new Map([[AGENT, { id: AGENT, name: "Front desk" }]]);
});

describe("an agent's pages", () => {
  it("open in the agent's shell, named for it", async () => {
    expect(((await open(AGENT)) as ReactElement<{ agent: unknown }>).props.agent).toEqual({ id: AGENT, name: "Front desk" });
  });

  it("aren't found for an unknown or archived agent, or an ID that isn't one", async () => {
    await expect(open("8a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d")).rejects.toMatchObject({ notFound: true });
    await expect(open("not-an-id")).rejects.toMatchObject({ notFound: true });
  });

  it("send someone the business doesn't let set up agents Home", async () => {
    fixture.capabilities = ["activity"];
    await expect(open(AGENT)).rejects.toMatchObject({ to: "/" });
  });
});
