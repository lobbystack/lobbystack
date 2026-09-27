import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ denied: false, options: vi.fn(), create: vi.fn(), routePhone: vi.fn(), routeWidget: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(),
  withOperatorTransaction: async (_request: Request, callback: (input: unknown) => unknown, options: unknown) => {
    fixture.options(options);
    if (fixture.denied) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return callback({ businessId: "business", session: { user: { id: "user" } } });
  },
}));
vi.mock("@lobbystack/domain", async (original) => ({
  ...await original<typeof import("@lobbystack/domain")>(),
  createReceptionist: fixture.create,
  routePhoneNumber: fixture.routePhone,
  routeWidgetKey: fixture.routeWidget,
  deleteReceptionist: fixture.remove,
}));

vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({}) }));

import { POST, PUT } from "./route";
import { DELETE } from "./[agentId]/route";

const agentId = "0b8a4c7e-3f1d-4a55-9d3e-2c1f0e9a7b61";
const otherId = "1c9b5d8f-4a2e-4b66-8e4f-3d2a1f0b8c72";
const request = (method: string, body: unknown) => new Request("http://localhost:3000/api/receptionists", { method, body: JSON.stringify(body) });

beforeEach(() => { vi.clearAllMocks(); fixture.denied = false; fixture.create.mockResolvedValue({ id: agentId, name: "After hours" }); fixture.remove.mockResolvedValue({ reassignedPhoneNumbers: 1, reassignedWidgetKeys: 0 }); });

describe("receptionist API", () => {
  it("creates a receptionist for business admins only", async () => {
    expect((await POST(request("POST", { name: "After hours", copyFromAgentId: otherId }))).status).toBe(201);
    expect(fixture.create).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", name: "After hours", copyFromAgentId: otherId });
    expect(fixture.options).toHaveBeenCalledWith({ minimumRole: "business_admin" });
    expect((await POST(request("POST", { name: "" }))).status).toBe(400);
    fixture.denied = true;
    expect((await POST(request("POST", { name: "Night" }))).status).toBe(403);
  });

  it("routes a number or the widget to a receptionist", async () => {
    expect((await PUT(request("PUT", { kind: "phone_number", id: otherId, agentId }))).status).toBe(200);
    expect(fixture.routePhone).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", agentId, phoneNumberId: otherId });
    expect((await PUT(request("PUT", { kind: "widget_key", id: otherId, agentId }))).status).toBe(200);
    expect(fixture.routeWidget).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", agentId, widgetKeyId: otherId });
    expect((await PUT(request("PUT", { kind: "fax", id: otherId, agentId }))).status).toBe(400);
  });

  it("deletes a receptionist only with somewhere for its numbers to go", async () => {
    const params = Promise.resolve({ agentId });
    expect((await DELETE(request("DELETE", { reassignToAgentId: otherId }), { params })).status).toBe(200);
    expect(fixture.remove).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", agentId, reassignToAgentId: otherId });
    expect((await DELETE(request("DELETE", {}), { params })).status).toBe(400);
    fixture.remove.mockRejectedValueOnce(Object.assign(new Error("A business needs at least one receptionist."), { status: 409, code: "receptionist_last" }));
    const last = await DELETE(request("DELETE", { reassignToAgentId: otherId }), { params });
    expect(last.status).toBe(409);
    expect(await last.json()).toMatchObject({ error: "A business needs at least one receptionist." });
  });
});
