import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ insert: vi.fn(), conflict: vi.fn(), update: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), enqueueOutbox: fixture.enqueue }));
import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { PATCH } from "./route";
const patch = (body: unknown) => PATCH(new Request("http://localhost:3000/api/agent", { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fakeOperator.tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ name: "Clinic" }], for: async () => [{ timezone: "America/Toronto" }] }) }) }),
    insert: () => ({ values: (value: unknown) => { fixture.insert(value); return { onConflictDoUpdate: (config: { set: unknown }) => { fixture.conflict(config.set); return { returning: async () => [{ id: "profile", updatedAt: new Date(0) }] }; } }; } }),
    update: () => ({ set: (value: unknown) => { fixture.update(value); return { where: () => ({ returning: async () => [{ id: "business" }] }) }; } }),
  };
});

describe("agent settings validation", () => {
  it.each([{}, { locale: "xx" }, { timezone: "Eastern" }, { timezone: "+05:00" }, { timezone: 5 }, { greeting: "" }, { transferMode: "invalid" }, { appointmentChangePolicy: {} }])("rejects invalid input %j before writing", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(fixture.insert).not.toHaveBeenCalled();
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });
  it("persists locale-only changes and refreshes the live-call snapshot", async () => {
    expect((await patch({ locale: "fr" })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ defaultLocale: "fr" }));
    expect(fixture.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", businessId: "business" }));
  });
  it("persists the business timezone and refreshes the live-call snapshot", async () => {
    expect((await patch({ timezone: "Europe/Belgrade" })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ timezone: "Europe/Belgrade" }));
    expect(fixture.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", businessId: "business" }));
  });
  it("persists the typed appointment policy without unrecognized properties", async () => {
    const policy = { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "otp_required" };
    expect((await patch({ appointmentChangePolicy: { ...policy, arbitrary: "discard" } })).status).toBe(200);
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ appointmentChangePolicy: policy }));
  });
  it("marks a summary a person writes so AI never replaces it", async () => {
    expect((await patch({ summary: "Maple Family Clinic offers checkups in Toronto." })).status).toBe(200);
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ summary: "Maple Family Clinic offers checkups in Toronto.", summarySource: "operator" }));
    expect(fixture.conflict).toHaveBeenCalledWith(expect.objectContaining({ summarySource: "operator" }));
  });
  it("hands the summary back to AI and queues a regeneration", async () => {
    expect((await patch({ regenerateSummary: true })).status).toBe(200);
    expect(fixture.conflict).toHaveBeenCalledWith(expect.objectContaining({ summarySource: "generated" }));
    expect(fixture.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "business.generateSummary", businessId: "business", payload: expect.objectContaining({ force: true }) }));
  });
  it.each([{ regenerateSummary: false }, { regenerateSummary: true, summary: "Written by hand." }])("rejects an unclear summary request %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });
  it("requires administrator access before any mutation", async () => {
    fakeOperator.denied = Object.assign(new Error("Forbidden"), { status: 403 });
    expect((await patch({ transferMode: "always" })).status).toBe(403);
    expect(fakeOperator.transactions).toEqual([{ minimumRole: "business_admin" }]);
    expect(fixture.insert).not.toHaveBeenCalled();
  });
});
