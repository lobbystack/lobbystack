import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ denied: false, update: vi.fn(), transaction: vi.fn(), enqueue: vi.fn(), saveReceptionist: vi.fn(), resolveReceptionist: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(),
  withOperatorTransaction: async (_request: Request, callback: (input: unknown) => unknown, options: unknown) => {
    fixture.transaction(options);
    if (fixture.denied) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return callback({ businessId: "business", tx: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "business", name: "Clinic" }] }) }) }),
      update: () => ({ set: (value: unknown) => { fixture.update(value); return { where: async () => undefined }; } }),
    } });
  },
}));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), enqueueOutbox: fixture.enqueue }));
vi.mock("@lobbystack/domain", async (original) => ({
  ...await original<typeof import("@lobbystack/domain")>(),
  updateReceptionistInTransaction: fixture.saveReceptionist,
  resolveReceptionist: fixture.resolveReceptionist,
}));
import { GET, PATCH } from "./route";
const agentId = "0b8a4c7e-3f1d-4a55-9d3e-2c1f0e9a7b61";
const patch = (body: unknown, query = "") => PATCH(new Request(`http://localhost:3000/api/agent${query}`, { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.clearAllMocks();
  fixture.denied = false;
  fixture.saveReceptionist.mockResolvedValue({ id: agentId, greeting: "Hi" });
  fixture.resolveReceptionist.mockResolvedValue({ id: agentId, greeting: "Hi" });
});

describe("agent settings validation", () => {
  it.each([{}, [], null, { locale: "xx" }, { greeting: "" }, { transferMode: "invalid" }, { appointmentChangePolicy: {} }, { receptionistLanguage: "de" }])("rejects invalid input %j before writing", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(fixture.saveReceptionist).not.toHaveBeenCalled();
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });
  it("persists locale-only changes and refreshes the live-call snapshot", async () => {
    expect((await patch({ locale: "fr" })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ defaultLocale: "fr" }));
    expect(fixture.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", businessId: "business" }));
    expect(fixture.saveReceptionist).not.toHaveBeenCalled();
  });
  it("persists the typed appointment policy without unrecognized properties", async () => {
    const policy = { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "otp_required" };
    expect((await patch({ appointmentChangePolicy: { ...policy, arbitrary: "discard" } })).status).toBe(200);
    expect(fixture.saveReceptionist).toHaveBeenCalledWith(expect.anything(), { businessId: "business", values: { appointmentChangePolicy: policy } });
  });
  it("saves the receptionist named in the query", async () => {
    expect((await patch({ greeting: "Evening!", name: "After hours", receptionistLanguage: "fr" }, `?agentId=${agentId}`)).status).toBe(200);
    expect(fixture.saveReceptionist).toHaveBeenCalledWith(expect.anything(), { businessId: "business", agentId, values: { greeting: "Evening!", name: "After hours", language: "fr" } });
    expect((await patch({ greeting: "x" }, "?agentId=not-a-uuid")).status).toBe(400);
  });
  it("reads a receptionist that belongs to the business, and 404s otherwise", async () => {
    expect((await GET(new Request(`http://localhost:3000/api/agent?agentId=${agentId}`))).status).toBe(200);
    expect(fixture.resolveReceptionist).toHaveBeenCalledWith(expect.anything(), "business", agentId);
    fixture.resolveReceptionist.mockResolvedValue({ id: "default-receptionist" });
    expect((await GET(new Request(`http://localhost:3000/api/agent?agentId=${agentId}`))).status).toBe(404);
  });
  it("requires administrator access before any mutation", async () => {
    fixture.denied = true;
    expect((await patch({ transferMode: "always" })).status).toBe(403);
    expect(fixture.transaction).toHaveBeenCalledWith({ minimumRole: "business_admin" });
    expect(fixture.saveReceptionist).not.toHaveBeenCalled();
  });
});
