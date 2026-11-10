import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  class BookingUnavailableError extends Error {
    constructor(readonly reason: string) { super("That appointment time is no longer available."); }
  }
  return { book: vi.fn(), list: vi.fn(), BookingUnavailableError };
});
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ bookAppointmentForOperator: fixture.book, listCurrentAppointments: fixture.list, BookingUnavailableError: fixture.BookingUnavailableError }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const serviceId = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const contactId = "7a2d3c0f-2e3b-4d4c-8f9a-1b2c3d4e5f60";
const staffId = "8b3e4d1a-3f4c-4e5d-9a0b-2c3d4e5f6a71";
const startsAt = "2099-10-14T14:00:00.000Z";
const book = (body: Record<string, unknown>) => POST(new Request("http://localhost:3010/api/appointments?businessId=business_1", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
  fixture.book.mockResolvedValue({ appointmentId: "appointment_1" });
});

describe("operator appointment create API", () => {
  it("books an existing contact as the signed-in operator", async () => {
    const response = await book({ serviceId, contactId, startsAt });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ appointmentId: "appointment_1" });
    expect(fixture.book).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", serviceId, contactId, startsAt });
  });

  it("books a new contact by name and phone, with a staff member", async () => {
    expect((await book({ serviceId, staffId, contact: { name: " Ana ", phone: "+14165550100" }, startsAt })).status).toBe(201);
    expect(fixture.book).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", serviceId, staffId, contact: { name: "Ana", phone: "+14165550100" }, startsAt });
  });

  it("rejects malformed ids, a past or missing time, and an incomplete new contact", async () => {
    expect((await book({ serviceId: "nope", contactId, startsAt })).status).toBe(400);
    expect((await book({ serviceId, contactId: "nope", startsAt })).status).toBe(400);
    expect((await book({ serviceId, staffId: "nope", contactId, startsAt })).status).toBe(400);
    expect((await book({ serviceId, contactId, startsAt: "2000-01-01T10:00:00.000Z" })).status).toBe(400);
    expect((await book({ serviceId, contactId })).status).toBe(400);
    expect((await book({ serviceId, contact: { phone: "+14165550100" }, startsAt })).status).toBe(400);
    expect((await book({ serviceId, contact: { name: "Ana", phone: "416 555 0100" }, startsAt })).status).toBe(400);
    expect(fixture.book).not.toHaveBeenCalled();
  });

  it("answers slot_unavailable when the time was taken meanwhile", async () => {
    fixture.book.mockRejectedValue(new fixture.BookingUnavailableError("taken"));
    const response = await book({ serviceId, contactId, startsAt });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "That appointment time is no longer available.", code: "slot_unavailable" });
  });

  it("returns the domain's refusal for roles below scheduler", async () => {
    fixture.book.mockRejectedValue(Object.assign(new Error("You do not have access to this business."), { status: 403, code: "forbidden" }));
    const response = await book({ serviceId, contactId, startsAt });
    expect(response.status).toBe(403);
  });
});
