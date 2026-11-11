import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ updateAppointmentNotes: fixture.update }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { PUT } from "./route";

const appointmentId = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const save = (body: Record<string, unknown>, id = appointmentId) => PUT(new Request(`http://localhost:3010/api/appointments/${id}/notes?businessId=business_1`, { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ appointmentId: id }) });

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
  fixture.update.mockResolvedValue(true);
});

describe("appointment notes API", () => {
  it("saves both notes, and clears one sent as null", async () => {
    expect((await save({ notes: "Bring forms", internalNotes: null })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", appointmentId, notes: "Bring forms", internalNotes: null });
  });

  it("answers 404 for another business's appointment, and 400 for a bad id or body", async () => {
    fixture.update.mockResolvedValue(false);
    expect((await save({ notes: "x", internalNotes: "y" })).status).toBe(404);
    expect((await save({ notes: "x" }, "nope")).status).toBe(400);
    expect((await save({ notes: 4, internalNotes: null })).status).toBe(400);
  });
});
