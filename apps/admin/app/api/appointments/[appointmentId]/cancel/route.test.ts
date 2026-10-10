import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ cancel: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ cancelAppointment: fixture.cancel }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const appointmentId = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const cancel = (id = appointmentId) => POST(
  new Request(`http://localhost:3010/api/appointments/${id}/cancel?businessId=business_1`, { method: "POST" }),
  { params: Promise.resolve({ appointmentId: id }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
  fixture.cancel.mockResolvedValue("cancelled");
});

describe("operator appointment cancel API", () => {
  it("cancels the appointment as the signed-in operator", async () => {
    const response = await cancel();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ appointmentId, status: "canceled" });
    expect(fixture.cancel).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", appointmentId });
  });

  it("returns the domain's refusal for roles below scheduler", async () => {
    fixture.cancel.mockRejectedValue(Object.assign(new Error("You do not have access to this business."), { status: 403, code: "forbidden" }));
    const response = await cancel();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "forbidden" });
  });

  it("returns 404 for an appointment the business doesn't have", async () => {
    fixture.cancel.mockRejectedValue(Object.assign(new Error("Appointment not found."), { status: 404, code: "not_found" }));
    const response = await cancel();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Appointment not found.", code: "not_found" });
  });

  it("returns 409 for an appointment that is already cancelled", async () => {
    fixture.cancel.mockResolvedValue("already");
    const response = await cancel();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "already_cancelled" });
  });

  it("rejects a malformed appointment id before cancelling", async () => {
    expect((await cancel("not-a-uuid")).status).toBe(400);
    expect(fixture.cancel).not.toHaveBeenCalled();
  });
});
