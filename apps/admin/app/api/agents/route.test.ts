import { beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({ listAgents: vi.fn(), createAgent: vi.fn(), archiveAgent: vi.fn(), setDefaultAgent: vi.fn(), moveChannel: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", async (original) => ({ ...await original<typeof import("@lobbystack/domain")>(), ...domain }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { PATCH as patchAgent, DELETE as archive } from "./[agentId]/route";
import { POST as makeDefault } from "./[agentId]/default/route";
import { PUT as move } from "./channels/route";
import { GET, POST } from "./route";

const AGENT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const request = (method: string, body?: unknown) => new Request("http://localhost:3000/api/agents", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = (agentId: string) => ({ params: Promise.resolve({ agentId }) });

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
});

describe("/api/agents", () => {
  it("lists the business's agents", async () => {
    domain.listAgents.mockResolvedValue([{ id: AGENT, name: "Front desk" }]);
    expect(await (await GET(request("GET"))).json()).toEqual([{ id: AGENT, name: "Front desk" }]);
    expect(domain.listAgents).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business" });
  });

  it("creates an agent from the one named", async () => {
    domain.createAgent.mockResolvedValue({ id: OTHER });
    const response = await POST(request("POST", { name: " Evening ", copyFromAgentId: AGENT }));
    expect(response.status).toBe(201);
    expect(domain.createAgent).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", name: "Evening", copyFromAgentId: AGENT });
  });

  it("passes the plan limit on as its code, for the upgrade dialog", async () => {
    domain.createAgent.mockRejectedValue(Object.assign(new Error("Your plan includes no more agents."), { status: 402, code: "agent_limit_reached" }));
    const response = await POST(request("POST", { name: "Evening" }));
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "agent_limit_reached" });
  });

  it("refuses a nameless agent before writing", async () => {
    expect((await POST(request("POST", { name: "  " }))).status).toBe(400);
    expect(domain.createAgent).not.toHaveBeenCalled();
  });

  it("keeps workspace fields off one agent's settings", async () => {
    const response = await patchAgent(request("PATCH", { greeting: "Hi", timezone: "UTC" }), params(AGENT));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "timezone belongs to the workspace." });
  });

  it("archives an agent, handing its channels to the one named", async () => {
    domain.archiveAgent.mockResolvedValue({ moved: 1 });
    expect(await (await archive(request("DELETE", { reassignToAgentId: OTHER }), params(AGENT))).json()).toEqual({ moved: 1 });
    expect(domain.archiveAgent).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", agentId: AGENT, reassignToAgentId: OTHER });
  });

  it("makes an agent the default", async () => {
    expect((await makeDefault(request("POST"), params(AGENT))).status).toBe(200);
    expect(domain.setDefaultAgent).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", agentId: AGENT });
  });

  it("moves a channel to another agent", async () => {
    expect((await move(request("PUT", { kind: "widget_key", id: OTHER, agentId: AGENT }))).status).toBe(200);
    expect(domain.moveChannel).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", kind: "widget_key", channelId: OTHER, agentId: AGENT });
    expect((await move(request("PUT", { kind: "email", id: OTHER, agentId: AGENT }))).status).toBe(400);
  });
});
